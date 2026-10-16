import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import { Public } from '../../common/auth/guards';
import { KycExempt } from '../../common/auth/kyc-gate.guard';
import { getDb } from '../../common/db/database';

@Controller('uploads')
@KycExempt()
export class FilesController {
  @Public() @Get(':key')
  async file(@Req() req: any, @Param('key') key: string, @Res() res: Response) {
    if (!/^[0-9a-f-]{36}\.[a-zA-Z0-9]+$/.test(key)) throw new NotFoundException();
    const url = `/uploads/${key}`;
    const user = req.user;
    // Include soft-deleted documents: their bytes must never become public.
    const kyc = await getDb('auth').prepare(`SELECT user_id FROM kyc_documents WHERE file_url = ?`).all(url);
    let allowed = false;
    if (kyc.length) {
      allowed = !!user && (user.role === 'super_admin' || kyc.every((d) => d.user_id === user.id));
      if (!allowed && user?.role === 'agent') {
        const assignments = await getDb('agent').prepare(`SELECT lead_user_id FROM agent_assignments WHERE agent_user_id = ? AND assignment_type = 'kyc_first_pass' AND status = 'assigned'`).all(user.id);
        allowed = kyc.every((d) => assignments.some((a) => a.lead_user_id === d.user_id));
      }
      res.setHeader('Cache-Control', 'private, no-store');
    } else {
      const fleet = getDb('fleet');
      const photos = await fleet.prepare(`SELECT c.owner_id, c.status, c.is_deleted FROM car_photos p JOIN cars c ON c.id = p.car_id WHERE p.file_url = ? AND p.is_deleted = 0`).all(url);
      allowed = photos.some((p) => (p.status === 'active' && p.is_deleted === 0) || (user && (user.role === 'super_admin' || user.id === p.owner_id)));
      if (!allowed && user) {
        const docs = await fleet.prepare(`SELECT c.owner_id FROM car_documents d JOIN cars c ON c.id = d.car_id WHERE d.file_url = ? AND d.is_deleted = 0`).all(url);
        allowed = docs.some((d) => user.role === 'super_admin' || user.id === d.owner_id);
      }
      res.setHeader('Cache-Control', 'private, no-store');
    }
    if (!allowed) throw new NotFoundException();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.sendFile(path.resolve(__dirname, '../../../uploads', key));
  }
}
