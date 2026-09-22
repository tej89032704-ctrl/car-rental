import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { StorageService } from '../../common/db/storage.service';

const REQUIRED_DOCS: Record<string, string[]> = {
  car_owner: ['id_proof', 'address_proof'],
  car_renter: ['id_proof', 'address_proof'],
  agent: ['id_proof'],
};

@Injectable()
export class KycService {
  constructor(private readonly storage: StorageService) {}

  saveFile(file: Express.Multer.File): string {
    return this.storage.save(file);
  }

  upload(userId: string, role: string, docType: string, fileUrl: string) {
    const required = REQUIRED_DOCS[role];
    if (!required?.includes(docType)) {
      throw new BadRequestException(`doc_type must be one of: ${required?.join(', ')}`);
    }
    const db = getDb('auth');
    const existing = db
      .prepare(`SELECT id FROM kyc_documents WHERE user_id = ? AND doc_type = ? AND is_deleted = 0`)
      .get(userId, docType) as any;
    if (existing) {
      db.prepare(
        `UPDATE kyc_documents SET status = 'pending', reviewed_by = NULL, first_passed_by = NULL,
         rejection_reason = NULL, updated_at = ?, created_by = ? WHERE id = ?`,
      ).run(nowUtc(), userId, existing.id);
      // replace file reference
      db.prepare(`UPDATE kyc_documents SET file_url = ? WHERE id = ?`).run(fileUrl, existing.id);
    } else {
      db.prepare(
        `INSERT INTO kyc_documents (id, user_id, doc_type, file_url, status, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      ).run(uuid(), userId, docType, fileUrl, nowUtc(), nowUtc(), userId);
    }
    db.prepare(`UPDATE users SET kyc_status = 'pending', updated_at = ? WHERE id = ?`).run(nowUtc(), userId);
    return { message: `${docType} uploaded. Awaiting review.` };
  }

  myDocuments(userId: string) {
    const docs = getDb('auth')
      .prepare(`SELECT * FROM kyc_documents WHERE user_id = ? AND is_deleted = 0`)
      .all(userId);
    const user = getDb('auth').prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as any;
    const required = REQUIRED_DOCS[user.role];
    return {
      required_docs: required,
      complete: required.every((t) => docs.some((d: any) => d.doc_type === t && d.status === 'approved')),
      documents: docs,
    };
  }

  queue(viewerId: string, viewerRole: string) {
    const db = getDb('auth');
    if (viewerRole === 'super_admin') {
      return db.prepare(
        `SELECT d.*, u.name, u.role AS user_role, u.phone FROM kyc_documents d
         JOIN users u ON u.id = d.user_id
         WHERE d.status IN ('pending','first_pass_done') AND d.is_deleted = 0`,
      ).all();
    }
    if (viewerRole === 'agent') {
      // Agent sees only leads assigned to them (agent_db lookup via value reference)
      const adb = getDb('agent');
      const assigned = adb
        .prepare(`SELECT lead_user_id FROM agent_assignments WHERE agent_user_id = ? AND status = 'assigned'`)
        .all(viewerId) as any[];
      if (assigned.length === 0) return [];
      const ids = assigned.map((a) => a.lead_user_id);
      const placeholders = ids.map(() => '?').join(',');
      return db.prepare(
        `SELECT d.*, u.name, u.role AS user_role, u.phone FROM kyc_documents d
         JOIN users u ON u.id = d.user_id
         WHERE d.status = 'pending' AND d.is_deleted = 0 AND d.user_id IN (${placeholders})`,
      ).all(...ids);
    }
    throw new ForbiddenException('Only Super Admin and Agents can view the KYC queue');
  }

  review(reviewerId: string, reviewerRole: string, docId: string, decision: 'approve' | 'reject' | 'first_pass', reason?: string) {
    const db = getDb('auth');
    const doc = db.prepare(`SELECT * FROM kyc_documents WHERE id = ? AND is_deleted = 0`).get(docId) as any;
    if (!doc) throw new BadRequestException('Document not found');

    if (reviewerRole === 'agent') {
      if (decision !== 'first_pass') throw new ForbiddenException('Agents may only perform first-pass review');
      const adb = getDb('agent');
      const assigned = adb.prepare(
        `SELECT 1 FROM agent_assignments WHERE agent_user_id = ? AND lead_user_id = ? AND status = 'assigned'`,
      ).get(reviewerId, doc.user_id);
      if (!assigned) throw new ForbiddenException('This lead is not assigned to you');
      db.prepare(
        `UPDATE kyc_documents SET status = 'first_pass_done', first_passed_by = ?, updated_at = ? WHERE id = ?`,
      ).run(reviewerId, nowUtc(), docId);
      this.recomputeKycStatus(doc.user_id);
      return { message: 'First pass recorded. Awaiting Super Admin final approval.' };
    }

    // super_admin
    if (decision === 'first_pass') throw new ForbiddenException('Super Admin gives final decisions only');
    if (decision === 'reject' && !reason) throw new BadRequestException('Rejection reason is mandatory');
    db.prepare(
      `UPDATE kyc_documents SET status = ?, reviewed_by = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`,
    ).run(decision === 'approve' ? 'approved' : 'rejected', reviewerId, reason ?? null, nowUtc(), docId);
    this.recomputeKycStatus(doc.user_id);
    return { message: `Document ${decision}d.` };
  }

  private recomputeKycStatus(userId: string) {
    const db = getDb('auth');
    const user = db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as any;
    if (!user) return;
    const required = REQUIRED_DOCS[user.role] ?? [];
    const approved = db
      .prepare(`SELECT doc_type FROM kyc_documents WHERE user_id = ? AND status = 'approved' AND is_deleted = 0`)
      .all(userId) as any[];
    const allApproved = required.every((t) => approved.some((d) => d.doc_type === t));
    const next = allApproved ? 'approved' : 'pending';
    db.prepare(`UPDATE users SET kyc_status = ?, updated_at = ? WHERE id = ?`).run(next, nowUtc(), userId);
  }
}
