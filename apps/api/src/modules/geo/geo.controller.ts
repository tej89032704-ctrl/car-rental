import { Controller, Get, Query, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/guards';
import { geocode } from '../../common/geo/geocode';

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

function tooSoonFor(userId: string): boolean {
  const now = Date.now();
  const last = recent.get(userId);
  if (last !== undefined && now - last < PER_USER_INTERVAL_MS) return true;
  recent.set(userId, now);
  // Bound the map. Without this a long-lived process accumulates one entry per
  // account id ever seen, which is a slow leak rather than an immediate fault.
  if (recent.size > 10_000) {
    for (const [id, at] of recent) {
      if (now - at > PER_USER_INTERVAL_MS) recent.delete(id);
      if (recent.size <= 5_000) break;
    }
  }
  return false;
}

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
}