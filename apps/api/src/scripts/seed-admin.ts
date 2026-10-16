import 'reflect-metadata';
import { runMigrations } from '../common/db/database';
import { ensureSuperAdmin } from '../ensure-admin';

/**
 * `npm run seed:admin` — create the super-admin account if it does not exist.
 * The account logic itself lives in ../ensure-admin so that production can run
 * the identical, idempotent function on first boot.
 */
runMigrations()
  .then(ensureSuperAdmin)
  .then(
    () => process.exit(0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
