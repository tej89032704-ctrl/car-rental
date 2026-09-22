import 'reflect-metadata';
import { runMigrations } from '../common/db/database';

runMigrations();
console.log('All migrations applied.');
