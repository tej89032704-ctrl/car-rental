import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/guards';
import { geocode, lookupPostalCode, reverseGeocode } from '../../common/geo/geocode';

/**
 * How often one account may start a lookup. Nominatim is already protected
 * globally by the request queue in the geocoder (one outbound call per second
 * no matter how many callers there are); this limit is a second, per-user line
 * so a single account cannot hold that shared queue and starve everyone else's
 * location picker.
 *
 * Not implemented with @Throttle: ThrottlerModule is configured in AppModule
 * but ThrottlerGuard is never registered as a guard, so the decorator would be
 * a no-op and imply protection that is not there.
 */
const PER_USER_INTERVAL_MS = 3000;
const recent = new Map<string, number>();

function tooSoonFor(userId: string, intervalMs = PER_USER_INTERVAL_MS): boolean {
  const now = Date.now();
  const last = recent.get(userId);
  if (last !== undefined && now - last < intervalMs) return true;
  recent.set(userId, now);
  // Bound the map. Without this a long-lived process accumulates one entry per
  // account id ever seen, which is a slow leak rather than an immediate fault.
  if (recent.size > 10_000) {
    for (const [id, at] of recent) {
      if (now - at > intervalMs) recent.delete(id);
      if (recent.size <= 5_000) break;
    }
  }
  return false;
}

/**
 * The address form asks far more often than the city picker — once per PIN and
 * once per dropped pin — so its per-user gap is shorter. The calls still share
 * the geocoder's own one-per-second queue, and identical PINs and points are
 * answered from its cache, so this only limits how fast one account can ask.
 */
const DETAIL_INTERVAL_MS = 1200;

@Controller('geo')
// RolesGuard rejects any endpoint with no @Roles declaration, and every signed-in
// role can use the location picker -- a renter needs one to set a pickup point,
// an owner to place the pin for their car, an agent on behalf of a client.
@Roles('car_renter', 'car_owner', 'agent', 'super_admin')
export class GeoController {
  /**
   * Free-text place lookup, used by the location picker when a user types a
   * city instead of dropping a pin by hand.
   *
   * Requires a session (the picker appears post-signup and on one's own
   * profile), but needs no @KycExempt: KycGateGuard already exempts GET, so a
   * user whose KYC is still pending can pick a location during onboarding.
   *
   * `unavailable` distinguishes "we could not reach the geocoder" from "that
   * place does not exist", so the UI can tell the user to retry or to try
   * another spelling instead of silently showing an empty dropdown.
   */
  @Get('search')
  async search(@Req() req: any, @Query('q') q: string) {
    const query = (q ?? '').trim();

    if (query.length < 2) {
      return { query, results: [], unavailable: false };
    }
    if (tooSoonFor(req.user.id)) {
      return { query, results: [], throttled: true };
    }

    const hits = await geocode(query);
    if (hits === null) {
      return { query, results: [], unavailable: true };
    }
    return {
      query,
      // Cap again at the boundary: the cache is shared, but a future geocoder
      // could return more per query than the picker is built to render.
      results: hits.slice(0, 5),
    };
  }

  /**
   * The places a PIN code covers, so the address form can offer them instead of
   * making the user guess what belongs in "city".
   *
   * An unknown PIN is an empty list, a geocoder we could not reach is
   * `unavailable` — the form keeps the typed digits either way and never blocks
   * a save on a third party being down.
   */
  @Get('pincode')
  async pincode(@Req() req: any, @Query('pin') pin: string) {
    const digits = String(pin ?? '').replace(/[^0-9]/g, '');
    if (digits.length !== 6) throw new BadRequestException('PIN code must be 6 digits');
    if (tooSoonFor(`pin:${req.user.id}`, DETAIL_INTERVAL_MS)) {
      return { pin: digits, places: [], throttled: true };
    }

    const places = await lookupPostalCode(digits);
    if (places === null) return { pin: digits, places: [], unavailable: true };
    return { pin: digits, places };
  }

  /** A dropped pin -> the address at that point, used to fill the form. */
  @Get('reverse')
  async reverse(@Req() req: any, @Query('lat') lat: string, @Query('lng') lng: string) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('lat and lng are required');
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new BadRequestException('lat and lng are out of range');
    }
    if (tooSoonFor(`rev:${req.user.id}`, DETAIL_INTERVAL_MS)) {
      return { address: null, throttled: true };
    }

    const address = await reverseGeocode(latitude, longitude);
    if (address === null) return { address: null, unavailable: true };
    return { address };
  }
}