import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { uuid } from './database';

const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

@Injectable()
export class StorageService {
  save(file: Express.Multer.File): string {
    const ext = path.extname(file.originalname || '') || '.bin';
    const key = `${uuid()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, key), file.buffer);
    return `/uploads/${key}`;
  }
}
