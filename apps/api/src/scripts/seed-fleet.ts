import 'reflect-metadata';
import { runMigrations } from '../common/db/database';
import { ensureDemoFleet } from '../seed-fleet';
import { ensureDemoHistory } from '../seed-history';

/**
 * `npm run seed:fleet` — fill an empty fleet with the demo Bengaluru cars, then
 * give it a handful of past trips and reviews.
 *
 * The logic lives in ../seed-fleet and ../seed-history so production can run the
 * identical, idempotent functions on boot.
 */
runMigrations()
  .then(ensureDemoFleet)
  .then(ensureDemoHistory)
  .then(
    (trips) => {
      console.log(trips ? `Seeded ${trips} trips` : 'Nothing to seed');
      process.exit(0);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
