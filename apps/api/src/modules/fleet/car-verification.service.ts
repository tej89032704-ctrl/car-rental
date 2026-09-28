/**
 * CarVerificationService — runs a live RC (VAHAN/RTO) check for a car,
 * persists the full attempt history, and updates the car's verdict.
 *
 * Ownership rule: car owners may verify their own cars (pre-submission
 * self-check); super admins may verify any car (approval-time check).
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { writeAudit } from '../../common/audit/audit';
import {
  rcProviderConfig,
  RcVerificationResult,
  resolveRcProvider,
  verifyWithMock,
  verifyWithVahan,
} from './rc-verify.providers';

@Injectable()
export class CarVerificationService {
  private db() {
    return getDb('fleet');
  }

  /** Current verification mode, surfaced in the admin/owner UIs (demo banner). */
  config() {
    return rcProviderConfig();
  }

  private async loadCar(carId: string) {
    const car = await this.db()
      .prepare(`SELECT * FROM cars WHERE id = ? AND is_deleted = 0`)
      .get(carId);
    if (!car) throw new NotFoundException('Car not found');
    return car as any;
  }

  private assertAccess(car: any, actor: { id: string; role: string }): void {
    if (actor.role !== 'super_admin' && car.owner_id !== actor.id) {
      throw new ForbiddenException('You can only verify your own cars');
    }
  }

  /**
   * Perform the live check. Either provider result is persisted so the attempt
   * history is always complete (re-verification appends, never overwrites).
   */
  async verify(actor: { id: string; role: string }, carId: string) {
    const car = await this.loadCar(carId);
    this.assertAccess(car, actor);

    const provider = resolveRcProvider(); // throws a helpful error on misuse
    const result: RcVerificationResult =
      provider === 'vahan'
        ? await verifyWithVahan(car.plate_number, { make: car.make, model: car.model })
        : verifyWithMock(car.plate_number, { make: car.make, model: car.model, year: car.year, fuel_type: car.fuel_type });

    const match = this.modelsMatch(
      car.make,
      car.model,
      result.vehicle?.maker,
      result.vehicle?.model,
    );
    const status = result.verdict === 'verified' ? 'verified' : result.verdict === 'failed' ? 'failed' : 'pending';

    const id = uuid();
    await this.db()
      .prepare(
        `INSERT INTO car_verifications
           (id, car_id, plate_number, provider, status, live, registered_make, registered_model,
            match_make_model, details, message, is_deleted, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      )
      .run(
        id,
        carId,
        car.plate_number,
        provider,
        status,
        result.live ? 1 : 0,
        result.vehicle?.maker ?? null,
        result.vehicle?.model ?? null,
        match ? 1 : 0,
        result.vehicle ? JSON.stringify(result.vehicle) : null,
        result.message ?? null,
        nowUtc(),
        nowUtc(),
        actor.id,
      );

    await this.db()
      .prepare(`UPDATE cars SET verification_status = ?, verified_at = ?, updated_at = ? WHERE id = ?`)
      .run(status, status === 'verified' ? nowUtc() : null, nowUtc(), carId);

    writeAudit('fleet', {
      actor_id: actor.id,
      action: `car.verification.${status}`,
      entity_type: 'car',
      entity_id: carId,
      before_value: { verification_status: car.verification_status },
      after_value: { verification_status: status, provider, live: result.live, match_make_model: match },
    });

    return {
      car_id: carId,
      plate_number: car.plate_number,
      ...result,
      match_make_model: match,
      listed: { make: car.make, model: car.model },
    };
  }

  async latest(carId: string) {
    const row = await this.db()
      .prepare(
        `SELECT * FROM car_verifications WHERE car_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1`,
      )
      .get(carId);
    return row ?? null;
  }

  /** Latest verdict plus the full attempt history. */
  async overview(actor: { id: string; role: string }, carId: string) {
    const car = await this.loadCar(carId);
    this.assertAccess(car, actor);
    const history = await this.db()
      .prepare(
        `SELECT * FROM car_verifications WHERE car_id = ? AND is_deleted = 0
         ORDER BY created_at DESC LIMIT 20`,
      )
      .all(carId);
    return { car_id: carId, verification_status: car.verification_status, verified_at: car.verified_at, history };
  }

  /**
   * Human fallback: the doctor/admin has inspected the physical RC (or the
   * vendor lookup is unavailable) and records a manual "verified" verdict.
   * Same storage shape as a provider run so history stays uniform.
   */
  async verifyManualOverride(actor: { id: string; role: string }, carId: string, reason: string) {
    const car = await this.loadCar(carId);
    this.assertAccess(car, actor);
    if (!reason || reason.length < 3) throw new BadRequestException('reason (min 3 characters) required');
    await this.db()
      .prepare(
        `INSERT INTO car_verifications
           (id, car_id, plate_number, provider, status, live, registered_make, registered_model,
            match_make_model, details, message, is_deleted, created_at, updated_at, created_by)
         VALUES (?, ?, ?, 'manual', 'verified', 0, ?, ?, 1, ?, ?, 0, ?, ?, ?)`,
      )
      .run(
        uuid(),
        carId,
        car.plate_number,
        car.make,
        car.model,
        JSON.stringify({ reason }),
        reason,
        nowUtc(),
        nowUtc(),
        actor.id,
      );
    await this.db()
      .prepare(`UPDATE cars SET verification_status = 'verified', verified_at = ?, updated_at = ? WHERE id = ?`)
      .run(nowUtc(), nowUtc(), carId);
    writeAudit('fleet', {
      actor_id: actor.id,
      action: 'car.verification.manual',
      entity_type: 'car',
      entity_id: carId,
      before_value: { verification_status: car.verification_status },
      after_value: { verification_status: 'verified', reason },
    });
    return { car_id: carId, message: 'Verification overridden manually to verified.' };
  }

  private modelsMatch(listedMake: string, listedModel: string, regMake?: string, regModel?: string): boolean {
    if (!regMake || !regModel) return false;
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    return norm(listedMake) === norm(regMake) && norm(listedModel) === norm(regModel);
  }
}