import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { writeAudit } from '../../common/audit/audit';
import { StorageService } from '../../common/db/storage.service';
import { enforceDemoFleetVisibility } from '../../seed-fleet';

const CORE_FIELDS = ['plate_number', 'category'];

@Injectable()
export class FleetService {
  constructor(private readonly storage: StorageService) {}

  private db() { return getDb('fleet'); }

  private async getOwnedCar(carId: string, ownerId: string) {
    const car = await this.db().prepare(`SELECT * FROM cars WHERE id = ? AND is_deleted = 0`).get(carId) as any;
    if (!car) throw new NotFoundException('Car not found');
    if (car.owner_id !== ownerId) throw new ForbiddenException('You can only manage your own cars');
    return car;
  }

  async createCar(ownerId: string, dto: any) {
    const plate = dto.plate_number ? String(dto.plate_number).toUpperCase() : '';
    const existing = await this.db().prepare(`SELECT id FROM cars WHERE plate_number = ? AND is_deleted = 0`).get(plate);
    if (existing) throw new BadRequestException(`A car with plate number ${plate} is already listed`);
    const id = uuid();
    await this.db().prepare(
      `INSERT INTO cars (id, owner_id, make, model, year, plate_number, category, transmission, fuel_type, seats, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    ).run(id, ownerId, dto.make, dto.model, dto.year, plate, dto.category,
      dto.transmission, dto.fuel_type, dto.seats, nowUtc(), nowUtc(), ownerId);
    await this.syncCarCache();
    return await this.getOwnedCar(id, ownerId);
  }

  /**
   * Rebuild the booking DB's car_cache from fleet data (cars + pricing + cover photo).
   * Runs at boot and after every car mutation so bookings always see current cars.
   * Preserves is_available (booking state) on upsert — only refreshed non-availability fields.
   */
  async syncCarCache(): Promise<{ synced: number }> {
    const bdb = getDb('booking');
    const cars = await this.db().prepare(
      `SELECT c.*, p.daily_rate_paise, p.security_deposit_paise,
              (SELECT file_url FROM car_photos ph WHERE ph.car_id = c.id AND ph.is_deleted = 0
               ORDER BY ph.sort_order, ph.created_at LIMIT 1) AS image_url
       FROM cars c LEFT JOIN car_pricing p ON p.car_id = c.id
       WHERE c.is_deleted = 0`,
    ).all() as any[];
    const upsert = bdb.prepare(
      `INSERT INTO car_cache (id, brand, model, plate, category, price_paise_per_day, security_deposit_paise, image_url, owner_id, status, is_deleted, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET
         brand = excluded.brand, model = excluded.model, plate = excluded.plate, category = excluded.category,
         price_paise_per_day = excluded.price_paise_per_day, security_deposit_paise = excluded.security_deposit_paise,
         image_url = excluded.image_url, owner_id = excluded.owner_id, status = excluded.status,
         is_deleted = 0, updated_at = excluded.updated_at`,
    );
    await bdb.transaction(async () => {
      const now = nowUtc();
      for (const c of cars) {
        await upsert.run(c.id, c.make, c.model, c.plate_number, c.category,
          c.daily_rate_paise || 0, c.security_deposit_paise || 0,
          c.image_url || null, c.owner_id, c.status, now);
      }
      // soft-remove cache rows for cars no longer present in fleet
      const ids = cars.map((c) => c.id);
      const stmt = ids.length
        ? bdb.prepare(
            `UPDATE car_cache SET is_deleted = 1, is_available = 0, updated_at = ?
             WHERE is_deleted = 0 AND id NOT IN (${ids.map(() => '?').join(',')})`,
          )
        : bdb.prepare(`UPDATE car_cache SET is_deleted = 1, is_available = 0, updated_at = ? WHERE is_deleted = 0`);
      await stmt.run(now, ...ids);
    });
    return { synced: cars.length };
  }

  async myCars(ownerId: string, status?: string) {
    // Join pricing in the same query: the panel's fleet card leads with the
    // per-day rate, and car_pricing sits in this same schema, so this costs
    // nothing extra and saves the client N detail calls to read a price.
    let sql = `SELECT c.*,
      p.daily_rate_paise, p.weekly_rate_paise, p.monthly_rate_paise,
      (SELECT COUNT(*) FROM car_photos ph WHERE ph.car_id = c.id AND ph.is_deleted = 0) AS photo_count
      FROM cars c LEFT JOIN car_pricing p ON p.car_id = c.id
      WHERE c.owner_id = ? AND c.is_deleted = 0`;
    const params: any[] = [ownerId];
    if (status) { sql += ` AND c.status = ?`; params.push(status); }
    sql += ` ORDER BY c.created_at DESC`;
    return await this.db().prepare(sql).all(...params);
  }

  /**
   * The owner as a renter is allowed to see, and nothing more.
   *
   * This feeds a public endpoint (GET /cars/:id is @Public), so the fields
   * are an allowlist, not a filtered copy of the user row: no id, email,
   * phone, date of birth or gender. Location is city/state only and is
   * omitted entirely when unset rather than rendered as a blank row.
   *
   * Spans three schemas, so it is assembled in the service layer rather than
   * a join -- the same rule the payouts aggregation follows.
   */
  private async publicOwner(ownerId: string) {
    const u = await getDb('auth')
      .prepare(
        `SELECT name, city, state, created_at, kyc_status, latitude, longitude, location_source
           FROM users WHERE id = ? AND is_deleted = 0`,
      )
      .get(ownerId) as any;
    if (!u) return null;

    const stats = await getDb('booking').prepare(`
      SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg_rating
      FROM reviews
      WHERE target_type = 'owner' AND target_user_id = ? AND reviewer_id <> ? AND is_deleted = 0
    `).get(ownerId, ownerId) as any;

    const listed = await this.db()
      .prepare(`SELECT COUNT(*) AS count FROM cars WHERE owner_id = ? AND status = 'active' AND is_deleted = 0`)
      .get(ownerId) as any;

    return {
      name: u.name,
      city: u.city ?? null,
      state: u.state ?? null,
      // Exact coordinates, deliberately. Rounding to a city centroid was
      // offered and declined, so the pin a renter sees is the pin the owner
      // placed. `location_source` travels with it so the UI can say whether it
      // is a dropped pin or a city the owner typed -- a 'geocoded' point can be
      // tens of km off and should not be presented as a precise address.
      latitude: u.latitude ?? null,
      longitude: u.longitude ?? null,
      location_source: u.location_source ?? null,
      member_since: u.created_at,
      // A verified owner is the single most useful trust signal on the page,
      // so surface it as a boolean the UI can render as a badge.
      verified: u.kyc_status === 'approved',
      rating: stats.count > 0 ? Math.round(stats.avg_rating * 10) / 10 : null,
      review_count: stats.count,
      cars_listed: listed.count,
    };
  }

  async carDetail(carId: string, requester?: { id: string; role: string }) {
    const car = await this.db().prepare(`SELECT * FROM cars WHERE id = ? AND is_deleted = 0`).get(carId) as any;
    if (!car) throw new NotFoundException('Car not found');

    // Decide visibility before assembling the response. Reading the photos and
    // the owner's profile costs four queries across three schemas, and a
    // caller who is about to get a 404 or a 403 should not cause any of them.
    if (!requester) {
      if (car.status !== 'active') throw new NotFoundException('Car not found');
    } else if (requester.role === 'car_owner') {
      await this.getOwnedCar(carId, requester.id);
    } else if (requester.role === 'car_renter' && car.status !== 'active') {
      throw new ForbiddenException('Car not available');
    }

    const photos = await this.db().prepare(`SELECT * FROM car_photos WHERE car_id = ? AND is_deleted = 0 ORDER BY sort_order`).all(carId);
    const pricing = await this.db().prepare(`SELECT * FROM car_pricing WHERE car_id = ?`).get(carId);
    const owner = await this.publicOwner(car.owner_id);
    return { ...car, photos, pricing, owner };
  }

  async updateCar(ownerId: string, carId: string, dto: any) {
    const car = await this.getOwnedCar(carId, ownerId);

    // An owner may pause or resume a listing that is already live, and nothing
    // else: draft/pending/rejected cars only ever reach active through review,
    // so a PATCH cannot promote itself around the approval queue.
    let paused: string | undefined;
    if (dto.status !== undefined) {
      if (dto.status !== 'active' && dto.status !== 'inactive') {
        throw new BadRequestException('Status cannot be set directly');
      }
      if (car.status !== 'active' && car.status !== 'inactive') {
        throw new BadRequestException('Only an approved listing can be paused or resumed');
      }
      paused = dto.status;
    }

    const before = { ...car };
    const fields = ['make', 'model', 'year', 'plate_number', 'category', 'transmission', 'fuel_type', 'seats'];
    const sets: string[] = [];
    const params: any[] = [];
    for (const f of fields) {
      if (dto[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(f === 'plate_number' ? String(dto[f]).toUpperCase() : dto[f]);
      }
    }
    if (dto.plate_number !== undefined) {
      const plate = String(dto.plate_number).toUpperCase();
      const existing = await this.db().prepare(`SELECT id FROM cars WHERE plate_number = ? AND id <> ? AND is_deleted = 0`).get(plate, carId);
      if (existing) throw new BadRequestException(`A car with plate number ${plate} is already listed`);
    }
    // A pause carries no detail fields, so this guard has to allow it through.
    if (sets.length === 0 && paused === undefined) throw new BadRequestException('Nothing to update');
    // Rule 5.2 Task 1.5: core detail edits on a live car push it back to pending_review
    const coreChanged = CORE_FIELDS.some((f) => dto[f] !== undefined && dto[f] !== car[f]);
    let newStatus = paused ?? car.status;
    if (coreChanged && (car.status === 'active' || car.status === 'inactive')) {
      newStatus = 'pending_review';
    }
    sets.push(`status = ?`, `updated_at = ?`);
    params.push(newStatus, nowUtc(), carId);
    await this.db().prepare(`UPDATE cars SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    writeAudit('fleet', {
      actor_id: ownerId, action: paused ? (paused === 'inactive' ? 'car.paused' : 'car.resumed') : 'car.updated',
      entity_type: 'car', entity_id: carId,
      before_value: before, after_value: await this.getOwnedCar(carId, ownerId),
    });
    await this.syncCarCache();
    const after = await this.getOwnedCar(carId, ownerId);
    if (paused === 'active' && !coreChanged) {
      // Resuming a listing puts a real car back on the browse page, so the demo
      // fleet has to step aside now rather than at the next boot. The check
      // only ever touches its own plates and is a no-op when this car is one.
      try {
        await enforceDemoFleetVisibility();
      } catch {
        /* reported by the seed itself */
      }
    }
    if (paused && !coreChanged) {
      return { car: after, note: paused === 'inactive' ? 'Listing paused' : 'Listing resumed' };
    }
    return { car: after, note: coreChanged ? 'Core details changed — car moved back to pending_review' : undefined };
  }

  async softDeleteCar(ownerId: string, carId: string) {
    const car = await this.getOwnedCar(carId, ownerId);
    await this.db().prepare(`UPDATE cars SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(nowUtc(), carId);
    writeAudit('fleet', { actor_id: ownerId, action: 'car.soft_deleted', entity_type: 'car', entity_id: carId, before_value: car, after_value: { is_deleted: 1 } });
    await this.syncCarCache();
    return { message: 'Car removed' };
  }

  async addPhotos(ownerId: string, carId: string, files: Express.Multer.File[]) {
    await this.getOwnedCar(carId, ownerId);
    for (const f of files) {
      const url = this.storage.save(f);
      await this.db().prepare(
        `INSERT INTO car_photos (id, car_id, file_url, sort_order, created_at, updated_at, created_by)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM car_photos WHERE car_id = ?), ?, ?, ?)`,
      ).run(uuid(), carId, url, carId, nowUtc(), nowUtc(), ownerId);
    }
    await this.syncCarCache();
    return { message: `${files.length} photo(s) uploaded` };
  }

  async addDocument(ownerId: string, carId: string, docType: string, file: Express.Multer.File) {
    await this.getOwnedCar(carId, ownerId);
    if (!['rc_book', 'insurance'].includes(docType)) throw new BadRequestException('doc_type must be rc_book or insurance');
    const url = this.storage.save(file);
    const db = this.db();
    const existing = await db.prepare(`SELECT id FROM car_documents WHERE car_id = ? AND doc_type = ? AND is_deleted = 0`).get(carId, docType) as any;
    if (existing) {
      await db.prepare(`UPDATE car_documents SET file_url = ?, status = 'pending', updated_at = ? WHERE id = ?`).run(url, nowUtc(), existing.id);
    } else {
      await db.prepare(
        `INSERT INTO car_documents (id, car_id, doc_type, file_url, status, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      ).run(uuid(), carId, docType, url, nowUtc(), nowUtc(), ownerId);
    }
    await this.syncCarCache();
    return { message: `${doc_type_label(docType)} uploaded` };
  }

  async submitForReview(ownerId: string, carId: string) {
    const car = await this.getOwnedCar(carId, ownerId);
    if (car.status !== 'draft' && car.status !== 'rejected') {
      throw new BadRequestException(`Car is already ${car.status}`);
    }
    const photoCount = (await this.db().prepare(`SELECT COUNT(*) AS c FROM car_photos WHERE car_id = ? AND is_deleted = 0`).get(carId) as any).c;
    if (photoCount < 4) throw new BadRequestException('Minimum 4 photos required');
    const docs = await this.db().prepare(`SELECT doc_type FROM car_documents WHERE car_id = ? AND is_deleted = 0`).all(carId) as any[];
    const types = new Set(docs.map((d) => d.doc_type));
    if (!types.has('rc_book')) throw new BadRequestException('RC book upload required');
    if (!types.has('insurance')) throw new BadRequestException('Insurance upload required');
    await this.db().prepare(`UPDATE cars SET status = 'pending_review', updated_at = ? WHERE id = ?`).run(nowUtc(), carId);
    await this.syncCarCache();
    return { message: 'Car submitted for review. Super Admin will approve or reject it.' };
  }

  async setPricing(ownerId: string, carId: string, dto: any) {
    await this.getOwnedCar(carId, ownerId);
    if (dto.daily_rate_paise <= 0) throw new BadRequestException('daily_rate_paise must be > 0');
    const db = this.db();
    const existing = await db.prepare(`SELECT id FROM car_pricing WHERE car_id = ?`).get(carId) as any;
    if (existing) {
      await db.prepare(
        `UPDATE car_pricing SET daily_rate_paise = ?, weekly_rate_paise = ?, monthly_rate_paise = ?, security_deposit_paise = ?, updated_at = ? WHERE id = ?`,
      ).run(dto.daily_rate_paise, dto.weekly_rate_paise ?? null, dto.monthly_rate_paise ?? null, dto.security_deposit_paise ?? 0, nowUtc(), existing.id);
    } else {
      await db.prepare(
        `INSERT INTO car_pricing (id, car_id, daily_rate_paise, weekly_rate_paise, monthly_rate_paise, security_deposit_paise, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(uuid(), carId, dto.daily_rate_paise, dto.weekly_rate_paise ?? null, dto.monthly_rate_paise ?? null, dto.security_deposit_paise ?? 0, nowUtc(), nowUtc(), ownerId);
    }
    await this.syncCarCache();
    return { message: 'Pricing saved' };
  }

  async setAvailability(ownerId: string, carId: string, dates: string[], isAvailable: boolean, reason?: string) {
    await this.getOwnedCar(carId, ownerId);
    const db = this.db();
    await db.transaction(async () => {
      for (const date of dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException(`Invalid date: ${date}`);
        const existing = await db.prepare(`SELECT id FROM car_availability WHERE car_id = ? AND date = ?`).get(carId, date) as any;
        if (existing) {
          await db.prepare(`UPDATE car_availability SET is_available = ?, reason = ?, updated_at = ? WHERE id = ?`)
            .run(isAvailable ? 1 : 0, reason ?? null, nowUtc(), existing.id);
        } else {
          await db.prepare(
            `INSERT INTO car_availability (id, car_id, date, is_available, reason, created_at, updated_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(uuid(), carId, date, isAvailable ? 1 : 0, reason ?? null, nowUtc(), nowUtc(), ownerId);
        }
      }
    });
    return { message: `${dates.length} day(s) updated` };
  }

  async getAvailability(carId: string, from: string, to: string) {
    return await this.db().prepare(
      `SELECT date, is_available, reason FROM car_availability WHERE car_id = ? AND date >= ? AND date <= ? ORDER BY date`,
    ).all(carId, from, to);
  }

  // ---------- internal API for other modules (never raw cross-db access) ----------
  async getPrice(carId: string) {
    const p = await this.db().prepare(`SELECT * FROM car_pricing WHERE car_id = ?`).get(carId) as any;
    if (!p) throw new NotFoundException('No pricing set for this car');
    return p;
  }

  async isCarActive(carId: string) {
    const car = await this.db().prepare(`SELECT status FROM cars WHERE id = ? AND is_deleted = 0`).get(carId) as any;
    return !!car && car.status === 'active';
  }

  async isAvailableRange(carId: string, startDay: string, endDay: string): Promise<boolean> {
    const blocked = await this.db().prepare(
      `SELECT COUNT(*) AS c FROM car_availability WHERE car_id = ? AND is_available = 0 AND date >= ? AND date <= ?`,
    ).get(carId, startDay, endDay) as any;
    return blocked.c === 0;
  }

  async getCarPublic(carId: string) {
    const car = await this.db().prepare(`SELECT * FROM cars WHERE id = ? AND is_deleted = 0`).get(carId) as any;
    if (!car || car.status !== 'active') throw new NotFoundException('Car not available');
    const photos = await this.db().prepare(`SELECT file_url FROM car_photos WHERE car_id = ? AND is_deleted = 0 ORDER BY sort_order`).all(carId);
    const pricing = await this.db().prepare(`SELECT daily_rate_paise, weekly_rate_paise, monthly_rate_paise, security_deposit_paise FROM car_pricing WHERE car_id = ?`).get(carId);
    return { ...car, photos, pricing };
  }

  async searchAvailable(category?: string) {
    let sql = `SELECT c.id, c.make, c.model, c.year, c.category, c.transmission, c.fuel_type, c.seats, c.plate_number,
      c.verification_status, c.verified_at,
      p.daily_rate_paise, p.security_deposit_paise,
      (SELECT file_url FROM car_photos ph WHERE ph.car_id = c.id AND ph.is_deleted = 0 ORDER BY sort_order LIMIT 1) AS cover_photo
      FROM cars c LEFT JOIN car_pricing p ON p.car_id = c.id
      WHERE c.status = 'active' AND c.is_deleted = 0`;
    const params: any[] = [];
    if (category) { sql += ` AND c.category = ?`; params.push(category); }
    sql += ` ORDER BY c.created_at DESC`;
    const rows = await this.db().prepare(sql).all(...params) as any[];
    // Ratings live in the booking DB, keyed by car id — attach per-car aggregates
    // so a renter sees the car's rating while browsing/before booking.
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      const stats = await getDb('booking').prepare(`
        SELECT target_user_id, COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg_rating
        FROM reviews
        WHERE target_type = 'car' AND target_user_id IN (${ids.map(() => '?').join(',')}) AND is_deleted = 0
        GROUP BY target_user_id
      `).all(...ids) as any[];
      const byId = new Map(stats.map((s: any) => [s.target_user_id, s]));
      for (const r of rows) {
        const s = byId.get(r.id);
        r.total_reviews = s ? s.count : 0;
        r.avg_rating = s ? Math.round(s.avg_rating * 10) / 10 : 0;
      }
    }
    return rows;
  }

  async ownerDailyRateMissing(carId: string) {
    const p = await this.db().prepare(`SELECT daily_rate_paise FROM car_pricing WHERE car_id = ?`).get(carId) as any;
    return !p || !p.daily_rate_paise;
  }

  async carReviews(carId: string) {
    // reviews live in the `booking` DB; reviewer names live in the `auth` DB
    const bdb = getDb('booking');
    const adb = getDb('auth');
    // a car owner rating their own car is a self-review — never count it
    const car = await this.db().prepare(`SELECT owner_id FROM cars WHERE id = ?`).get(carId) as any;
    const ownerId = car?.owner_id ?? '__none__';
    const rows = await bdb.prepare(`
      SELECT r.id, r.booking_id, r.reviewer_id, r.rating, r.comment, r.created_at
      FROM reviews r
      WHERE r.target_type = 'car' AND r.target_user_id = ? AND r.reviewer_id <> ? AND r.is_deleted = 0
      ORDER BY r.created_at DESC
    `).all(carId, ownerId) as any[];
    const nameStmt = adb.prepare(`SELECT name FROM users WHERE id = ?`);
    const reviews = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      booking_id: r.booking_id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      reviewer_name: (await nameStmt.get(r.reviewer_id) as any)?.name ?? 'Renter',
    })));
    const stats = await bdb.prepare(`
      SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS avg_rating
      FROM reviews WHERE target_type = 'car' AND target_user_id = ? AND reviewer_id <> ? AND is_deleted = 0
    `).get(carId, ownerId) as any;
    return { reviews, avg_rating: Math.round(stats.avg_rating * 10) / 10, total_reviews: stats.count };
  }
}

function doc_type_label(t: string) {
  return t === 'rc_book' ? 'RC book' : 'Insurance';
}
