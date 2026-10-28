import 'reflect-metadata';
import { runMigrations } from '../common/db/database';
import { ensureDemoFleet } from '../seed-fleet';

/**
 * `npm run seed:fleet` — fill an empty fleet with the demo Bengaluru cars.
 * The logic lives in ../seed-fleet so production can run the identical,
 * idempotent function on first boot.
 */
runMigrations()
  .then(ensureDemoFleet)
  .then(
    (created) => {
      console.log(created ? `Seeded ${created} cars` : 'Nothing to seed');
      process.exit(0);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
