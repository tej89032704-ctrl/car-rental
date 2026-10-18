/**
 * Boot-time database readiness, shared by main.ts (which does the work) and the
 * health endpoint (which reports it).
 *
 * The process used to await migrations *before* binding its port. On a platform
 * that judges a deploy by whether the port answers, one unreachable database
 * turned into a service that accepted TCP connections and then never said a
 * word: no error page, no 502, just a request that hung until the client gave
 * up. Tracked separately, the HTTP server can come up immediately and still
 * tell the truth about the database.
 */
export type DbPhase = 'starting' | 'migrating' | 'ready' | 'failed';

interface Readiness {
  phase: DbPhase;
  /** Human-readable reason for the last failure, safe to show (no credentials). */
  message: string | null;
  /** How many times boot-time initialisation has been attempted. */
  attempts: number;
  /** Set once migrations have completed at least once. */
  migrated: boolean;
}

export const dbReadiness: Readiness = {
  phase: 'starting',
  message: null,
  attempts: 0,
  migrated: false,
};

export function setDbPhase(phase: DbPhase, message: string | null = null): void {
  dbReadiness.phase = phase;
  dbReadiness.message = message;
}
