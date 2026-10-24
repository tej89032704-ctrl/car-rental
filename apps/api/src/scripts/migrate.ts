import 'reflect-metadata';
import { runMigrations } from '../common/db/database';

runMigrations()
  .then(() => {
    console.log('All migrations applied.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exit(1);
  });
