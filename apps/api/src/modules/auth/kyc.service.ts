import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { getDb, nowUtc, uuid } from '../../common/db/database';
import { StorageService } from '../../common/db/storage.service';
import { validateAadhaar, validateDrivingLicense, strengthLabel } from '../../common/kyc/doc-validate';
import { verifyOfflineEkyc } from '../../common/kyc/aadhaar-ekyc';

const REQUIRED_DOCS: Record<string, string[]> = {
  car_owner: ['id_proof', 'address_proof'],
  car_renter: ['id_proof', 'address_proof'],
  agent: ['id_proof'],
};

/**
 * Documents a role may submit.
 *
 * `driving_license` is always an optional extra — it is never mandatory, so
 * requiring it would only add friction. `aadhaar` is accepted wherever an id
 * proof is required, because it *is* an id proof.
 */
function allowedDocTypes(role: string): string[] {
  const required = REQUIRED_DOCS[role] ?? [];
  const allowed = new Set(required);
  if (required.includes('id_proof')) allowed.add('aadhaar');
  allowed.add('driving_license');
  return [...allowed];
}

/** Does a submitted document fill a required slot? */
function satisfies(requiredDoc: string, submitted: string): boolean {
  if (submitted === requiredDoc) return true;
  return requiredDoc === 'id_proof' && submitted === 'aadhaar';
}

type VerifyStatus = 'pass' | 'review' | 'fail';

interface Identity {
  docNumber: string | null;
  docExpiry: string | null;
  verifyStatus: VerifyStatus | null;
  verifyDetail: string | null;
}

/** Offline e-KYC photos are base64 JPEG in practice; sniff rather than assume. */
function photoExt(b64: string): string {
  if (b64.startsWith('/9j/')) return '.jpg';
  if (b64.startsWith('iVBOR')) return '.png';
  if (b64.startsWith('R0lGOD')) return '.gif';
  if (b64.startsWith('UklGR')) return '.webp';
  return '.jpg';
}

@Injectable()
export class KycService {
  constructor(private readonly storage: StorageService) {}

  saveFile(file: Express.Multer.File): string {
    return this.storage.save(file);
  }

  /**
   * Tier 1: validate what the applicant typed before it is written down.
   *
   * A bad number fails the upload naming the problem — collecting it and then
   * ignoring it would defeat the point. A number with no checksum behind it
   * (a masked card) is accepted but recorded as `review`, so the reviewer sees
   * that it was never verified.
   */
  private validateIdentity(
    docType: string,
    docNumber: string | null | undefined,
    docExpiry: string | null | undefined,
  ): Identity {
    const number = String(docNumber ?? '').trim();
    const expiry = String(docExpiry ?? '').trim() || null;

    if (docType === 'aadhaar') {
      if (!number) throw new BadRequestException('Aadhaar number is required for an Aadhaar document');
      const v = validateAadhaar(number);
      if (!v.ok) throw new BadRequestException(v.error);
      return {
        docNumber: v.masked, // never the full 12 digits — Aadhaar Act 2016 s.29(3)
        docExpiry: null,
        verifyStatus: v.strength === 'checksum_ok' ? 'pass' : 'review',
        verifyDetail: strengthLabel(v.strength),
      };
    }

    if (docType === 'driving_license') {
      if (!number) throw new BadRequestException('Driving licence number is required');
      if (!expiry) throw new BadRequestException('Driving licence expiry date is required');
      const v = validateDrivingLicense(number, expiry);
      if (!v.ok) throw new BadRequestException(v.error);
      if (v.daysToExpiry < 0) throw new BadRequestException('That driving licence has already expired');
      const format = v.pattern === 'strict' ? 'parsed' : 'older format';
      return {
        docNumber: v.number,
        docExpiry: v.expiry,
        verifyStatus: v.pattern === 'strict' ? 'pass' : 'review',
        verifyDetail: `${v.state} licence (${format}), issued ${v.issueYear ?? '—'}, expires in ${v.daysToExpiry} days`,
      };
    }

    // id_proof / address_proof carry no structured number to check, but if one
    // was supplied and is a valid Aadhaar, mask it anyway — the s.29(3) rule is
    // about the digits, not about which field they arrived in.
    let stored = number || null;
    if (stored) {
      const a = validateAadhaar(stored);
      if (a.ok) stored = a.masked;
    }
    return { docNumber: stored, docExpiry: expiry, verifyStatus: null, verifyDetail: null };
  }

  /** Shared insert-or-replace: one row per (user, doc_type), always reset to `pending`. */
  private async upsertDocument(args: {
    userId: string;
    docType: string;
    fileUrl: string;
    identity: Identity;
    verifiedPayload: unknown;
  }): Promise<void> {
    const db = getDb('auth');
    const now = nowUtc();
    const { identity } = args;
    const verifiedAt = identity.verifyStatus ? now : null;
    const payload = args.verifiedPayload ? JSON.stringify(args.verifiedPayload) : null;

    const existing = await db
      .prepare(`SELECT id FROM kyc_documents WHERE user_id = ? AND doc_type = ? AND is_deleted = 0`)
      .get(args.userId, args.docType) as any;

    if (existing) {
      await db.prepare(
        `UPDATE kyc_documents SET
           status = 'pending', reviewed_by = NULL, first_passed_by = NULL,
           rejection_reason = NULL, file_url = ?,
           doc_number = ?, doc_expiry = ?, verify_status = ?, verify_detail = ?,
           verified_at = ?, verified_payload = ?,
           updated_at = ?, created_by = ?
         WHERE id = ?`,
      ).run(
        args.fileUrl,
        identity.docNumber, identity.docExpiry, identity.verifyStatus, identity.verifyDetail,
        verifiedAt, payload,
        now, args.userId, existing.id,
      );
    } else {
      await db.prepare(
        `INSERT INTO kyc_documents
           (id, user_id, doc_type, file_url, status, doc_number, doc_expiry,
            verify_status, verify_detail, verified_at, verified_payload,
            created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        uuid(), args.userId, args.docType, args.fileUrl,
        identity.docNumber, identity.docExpiry, identity.verifyStatus, identity.verifyDetail,
        verifiedAt, payload,
        now, now, args.userId,
      );
    }

    await db
      .prepare(`UPDATE users SET kyc_status = 'pending', updated_at = ? WHERE id = ?`)
      .run(nowUtc(), args.userId);
  }

  async upload(
    userId: string,
    role: string,
    docType: string,
    fileUrl: string,
    docNumber?: string | null,
    docExpiry?: string | null,
  ) {
    const allowed = allowedDocTypes(role);
    if (!allowed.includes(docType)) {
      throw new BadRequestException(`doc_type must be one of: ${allowed.join(', ')}`);
    }
    const identity = this.validateIdentity(docType, docNumber, docExpiry);
    await this.upsertDocument({ userId, docType, fileUrl, identity, verifiedPayload: null });
    return {
      message: `${docType} uploaded. Awaiting review.`,
      doc_number: identity.docNumber,
      doc_expiry: identity.docExpiry,
      verify_status: identity.verifyStatus,
      verify_detail: identity.verifyDetail,
    };
  }

  /**
   * Verify an Aadhaar Paperless Offline e-KYC pack and file it as the
   * applicant's `aadhaar` document.
   *
   * A rejected verification is returned as a domain result rather than an HTTP
   * error: a wrong Share Phrase is a typo to be retried, not a server fault,
   * and the UI needs the exact message either way. Nothing is stored on a
   * failure — there are no facts in an unverifiable pack worth keeping.
   */
  async offlineEkyc(
    userId: string,
    role: string,
    file: Express.Multer.File,
    body: { [k: string]: unknown },
  ) {
    if (!allowedDocTypes(role).includes('aadhaar')) {
      throw new ForbiddenException('Offline e-KYC is not available for this role');
    }
    const shareCode = String(body.share_code ?? '').trim();
    if (!shareCode) throw new BadRequestException('share_code is required');
    if (!file?.buffer?.length) throw new BadRequestException('file is required');

    const db = getDb('auth');
    const user = await db
      .prepare(`SELECT name FROM users WHERE id = ?`)
      .get(userId) as { name?: string } | undefined;

    const result = verifyOfflineEkyc({
      file: file.buffer,
      filename: file.originalname ?? null,
      shareCode,
      mobile: body.mobile ? String(body.mobile) : null,
      expectedLast4: body.expected_last4 ? String(body.expected_last4) : null,
      // The account name is the more meaningful comparison, so it is used when
      // the form does not supply its own.
      expectedName: (body.expected_name ? String(body.expected_name) : null) ?? user?.name ?? null,
      expectedDob: body.expected_dob ? String(body.expected_dob) : null,
    });

    const view = {
      status: result.status,
      code: result.code,
      message: result.message,
      detail: result.detail,
      crossCheck: result.crossCheck,
      warnings: result.warnings,
      document: null as unknown,
    };
    if (result.status === 'fail' || !result.data) return view;

    const d = result.data;
    const fileUrl = d.photo
      ? this.storage.saveBuffer(Buffer.from(d.photo, 'base64'), photoExt(d.photo))
      : '';

    const identity: Identity = {
      docNumber: `XXXX XXXX ${d.last4}`,
      docExpiry: null,
      verifyStatus: result.status,
      verifyDetail: [result.detail, ...result.warnings].filter(Boolean).join(' · '),
    };

    await this.upsertDocument({
      userId,
      docType: 'aadhaar',
      fileUrl,
      identity,
      verifiedPayload: {
        name: d.name,
        dob: d.dob,
        year: d.year,
        gender: d.gender,
        address: d.address,
        referenceId: d.referenceId,
        issuedAt: d.issuedAt,
        ageDays: d.ageDays,
        certLabel: d.certLabel,
        crossCheck: result.crossCheck,
        warnings: result.warnings,
      },
    });

    view.document = await db
      .prepare(`SELECT * FROM kyc_documents WHERE user_id = ? AND doc_type = 'aadhaar' AND is_deleted = 0`)
      .get(userId);
    return view;
  }

  async myDocuments(userId: string) {
    const docs = await getDb('auth')
      .prepare(`SELECT * FROM kyc_documents WHERE user_id = ? AND is_deleted = 0`)
      .all(userId);
    const user = await getDb('auth').prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as any;
    const required = REQUIRED_DOCS[user.role];
    return {
      required_docs: required,
      complete: required.every((t) =>
        docs.some((d: any) => satisfies(t, d.doc_type) && d.status === 'approved'),
      ),
      documents: docs,
    };
  }

  async queue(viewerId: string, viewerRole: string) {
    const db = getDb('auth');
    if (viewerRole === 'super_admin') {
      return await db.prepare(
        `SELECT d.*, u.name, u.role AS user_role, u.phone FROM kyc_documents d
         JOIN users u ON u.id = d.user_id
         WHERE d.status IN ('pending','first_pass_done') AND d.is_deleted = 0`,
      ).all();
    }
    if (viewerRole === 'agent') {
      // Agent sees only leads assigned to them (agent_db lookup via value reference)
      const adb = getDb('agent');
      const assigned = await adb
        .prepare(`SELECT lead_user_id FROM agent_assignments WHERE agent_user_id = ? AND status = 'assigned'`)
        .all(viewerId) as any[];
      if (assigned.length === 0) return [];
      const ids = assigned.map((a) => a.lead_user_id);
      const placeholders = ids.map(() => '?').join(',');
      return await db.prepare(
        `SELECT d.*, u.name, u.role AS user_role, u.phone FROM kyc_documents d
         JOIN users u ON u.id = d.user_id
         WHERE d.status = 'pending' AND d.is_deleted = 0 AND d.user_id IN (${placeholders})`,
      ).all(...ids);
    }
    throw new ForbiddenException('Only Super Admin and Agents can view the KYC queue');
  }

  async review(reviewerId: string, reviewerRole: string, docId: string, decision: 'approve' | 'reject' | 'first_pass', reason?: string) {
    const db = getDb('auth');
    const doc = await db.prepare(`SELECT * FROM kyc_documents WHERE id = ? AND is_deleted = 0`).get(docId) as any;
    if (!doc) throw new BadRequestException('Document not found');

    if (reviewerRole === 'agent') {
      if (decision !== 'first_pass') throw new ForbiddenException('Agents may only perform first-pass review');
      const adb = getDb('agent');
      const assigned = await adb.prepare(
        `SELECT 1 FROM agent_assignments WHERE agent_user_id = ? AND lead_user_id = ? AND status = 'assigned'`,
      ).get(reviewerId, doc.user_id);
      if (!assigned) throw new ForbiddenException('This lead is not assigned to you');
      await db.prepare(
        `UPDATE kyc_documents SET status = 'first_pass_done', first_passed_by = ?, updated_at = ? WHERE id = ?`,
      ).run(reviewerId, nowUtc(), docId);
      await this.recomputeKycStatus(doc.user_id);
      return { message: 'First pass recorded. Awaiting Super Admin final approval.' };
    }

    // super_admin
    if (decision === 'first_pass') throw new ForbiddenException('Super Admin gives final decisions only');
    if (decision === 'reject' && !reason) throw new BadRequestException('Rejection reason is mandatory');
    await db.prepare(
      `UPDATE kyc_documents SET status = ?, reviewed_by = ?, rejection_reason = ?, updated_at = ? WHERE id = ?`,
    ).run(decision === 'approve' ? 'approved' : 'rejected', reviewerId, reason ?? null, nowUtc(), docId);
    await this.recomputeKycStatus(doc.user_id);
    return { message: `Document ${decision}d.` };
  }

  private async recomputeKycStatus(userId: string) {
    const db = getDb('auth');
    const user = await db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as any;
    if (!user) return;
    const required = REQUIRED_DOCS[user.role] ?? [];
    const approved = await db
      .prepare(`SELECT doc_type FROM kyc_documents WHERE user_id = ? AND status = 'approved' AND is_deleted = 0`)
      .all(userId) as any[];
    const allApproved = required.every((t) => approved.some((d) => satisfies(t, d.doc_type)));
    const next = allApproved ? 'approved' : 'pending';
    await db.prepare(`UPDATE users SET kyc_status = ?, updated_at = ? WHERE id = ?`).run(next, nowUtc(), userId);
  }
}
