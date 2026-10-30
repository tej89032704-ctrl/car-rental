import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getDb, closeAll } = require('../dist/common/db/database.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../dist/common/auth/guards.js');
const target = new URL(process.env.DATABASE_URL || '');
if (!['localhost','127.0.0.1','[::1]'].includes(target.hostname)) throw new Error('CRM regression requires a local database');
const base = process.env.CRM_TEST_API || 'http://127.0.0.1:4000';
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname)) throw new Error('CRM regression requires a local API');
let checks = 0;
const stamp = Date.now();
const password = randomBytes(20).toString('base64url');
let fixtureSequence = 0;
const auth = getDb('auth');
const agentDb = getDb('agent');
async function fixture(role, suffix) {
  const id = randomUUID();
  const email = `crm_${stamp}_${suffix}@test.local`;
  await auth.prepare(`INSERT INTO users (id,name,email,phone,password_hash,role,status,created_at,updated_at,created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
    .run(id, `CRM ${suffix}`, email, `+91${String(stamp).slice(-8)}${String(++fixtureSequence).padStart(2,'0')}`, await bcrypt.hash(password,10), role, new Date().toISOString(), new Date().toISOString(), id);
  return { id, email, role, password };
}
async function request(method, route, token, body) {
  const r = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
function check(label, condition) { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); }
async function login(user, portal) {
  const r = await request('POST', `/auth/${portal ? `${portal}/` : ''}login`, null, { email: user.email, password });
  check(`${user.role} portal login`, r.status === 200 && !!r.data.access_token);
  return r.data.access_token;
}
let privateFile;
try {
  const admin = await fixture('super_admin','admin');
  const manager = await fixture('manager','manager');
  const otherManager = await fixture('manager','outside');
  const customer = await fixture('car_renter','customer');
  const otherCustomer = await fixture('car_renter','stranger');
  const owner = await fixture('car_owner','owner');
  const adminToken = jwt.sign({ sub: admin.id, role: admin.role }, JWT_SECRET, { expiresIn: 600 });
  const managerToken = await login(manager,'manager');
  const outsideToken = await login(otherManager,'manager');
  const customerToken = await login(customer,'');
  const strangerToken = await login(otherCustomer,'');
  const ownerToken = await login(owner,'');
  const staffDto = { name: 'CRM Field Agent', email: `crm_${stamp}_field@test.local`, phone: `+9199${String(stamp).slice(-8)}`, role: 'agent', password };
  let r = await request('POST','/crm/staff',managerToken,staffDto);
  check('manager cannot provision staff',r.status === 403);
  r = await request('POST','/crm/staff',adminToken,staffDto);
  check('admin provisions agent',r.status === 201);
  const field = { id: r.data.id, email: staffDto.email, role: 'agent' };
  const agentToken = await login(field,'agent');
  r = await request('POST','/crm/staff',adminToken,{ ...staffDto, name: 'CRM Provisioned Manager', email: `crm_${stamp}_provisioned@test.local`, phone: `+9188${String(stamp).slice(-8)}`, role: 'manager' });
  check('admin provisions manager',r.status === 201);
  r = await request('POST','/auth/manager/login',null,{ email: customer.email, password });
  check('renter rejected by manager login',r.status === 401);
  r = await request('POST','/auth/signup',null,{ ...staffDto, role:'manager' });
  check('public manager signup rejected',r.status === 400);
  const challenge = jwt.sign({ sub: admin.id, scope:'2fa' }, JWT_SECRET,{ expiresIn:60 });
  r = await request('GET','/crm/enquiries',challenge);
  check('2FA challenge cannot authenticate API',r.status === 401);
  r = await request('PUT',`/crm/team/${field.id}`,adminToken,{ manager_user_id:manager.id });
  check('admin assigns agent to manager',r.status === 200);
  r = await request('GET','/crm/staff',managerToken);
  check('manager team excludes other managers',r.data.length === 1 && r.data[0].id === field.id);
  const enquiry = { subject:'Weekend SUV rental', city:'Bengaluru', start_date:'2026-12-01', end_date:'2026-12-04', budget_paise:1500000 };
  r = await request('POST','/crm/enquiries',customerToken,{ ...enquiry, end_date:enquiry.start_date });
  check('invalid date range rejected',r.status === 400);
  r = await request('POST','/crm/enquiries',customerToken,enquiry);
  check('customer creates enquiry without KYC',r.status === 201);
  const enquiryId = r.data.id;
  r = await request('GET','/crm/enquiries?page=1&pageSize=1',customerToken);
  check('list is paginated and customer scoped',r.data.data.length === 1 && r.data.pagination.totalItems === 1);
  r = await request('PATCH',`/crm/enquiries/${enquiryId}`,adminToken,{ manager_user_id:manager.id, agent_user_id:field.id });
  check('admin routes enquiry to team',r.status === 200);
  r = await request('GET',`/crm/enquiries/${enquiryId}/activities`,outsideToken);
  check('foreign manager cannot read enquiry',r.status === 404);
  r = await request('PATCH',`/crm/enquiries/${enquiryId}`,outsideToken,{ status:'lost' });
  check('foreign manager cannot modify enquiry',r.status === 404);
  r = await request('GET',`/crm/enquiries/${enquiryId}/activities`,strangerToken);
  check('foreign customer cannot read enquiry',r.status === 404);
  r = await request('GET','/crm/enquiries',ownerToken);
  check('owner excluded from CRM',r.status === 403);
  r = await request('PATCH',`/crm/enquiries/${enquiryId}`,agentToken,{ manager_user_id:otherManager.id });
  check('agent cannot reassign enquiry',r.status === 403);
  r = await request('PATCH',`/crm/enquiries/${enquiryId}`,managerToken,{ manager_user_id:otherManager.id });
  check('manager cannot transfer outside team',r.status === 403);
  r = await request('PATCH',`/crm/enquiries/${enquiryId}`,agentToken,{ status:'quoted' });
  check('quote stage requires price',r.status === 400);
  r = await request('PATCH',`/crm/enquiries/${enquiryId}`,agentToken,{ status:'quoted', quote_paise:1200000, quote_note:'Three days, subject to owner approval', follow_up_at:'2026-11-20T10:00:00Z' });
  check('agent records follow-up and quote',r.status === 200);
  r = await request('POST',`/crm/enquiries/${enquiryId}/notes`,managerToken,{ body:'Internal customer follow-up detail' });
  check('manager adds internal note',r.status === 201);
  r = await request('GET',`/crm/enquiries/${enquiryId}/activities`,customerToken);
  check('internal notes hidden from customer',r.data.every((a) => a.visibility === 'customer'));
  r = await request('POST',`/crm/enquiries/${enquiryId}/accept`,strangerToken);
  check('foreign customer cannot accept quote',r.status === 404);
  r = await request('POST',`/crm/enquiries/${enquiryId}/accept`,customerToken);
  check('customer accepts quote',r.status === 201);
  r = await request('PATCH',`/crm/enquiries/${enquiryId}`,managerToken,{ quote_paise:999 });
  check('accepted quote cannot be edited',r.status === 400);
  check('quote does not create booking',(await getDb('booking').prepare('SELECT COUNT(*) AS c FROM bookings WHERE renter_id = ?').get(customer.id)).c === 0);
  r = await request('PUT',`/crm/team/${field.id}`,adminToken,{ manager_user_id:otherManager.id });
  check('admin can transfer team',r.status === 200);
  r = await request('GET',`/crm/enquiries/${enquiryId}/activities`,managerToken);
  check('old manager loses access after transfer',r.status === 404);
  r = await request('GET',`/crm/enquiries/${enquiryId}/activities`,outsideToken);
  check('new manager gains access after transfer',r.status === 200);
  r = await request('PUT',`/crm/team/${field.id}`,adminToken,{ manager_user_id:manager.id });
  check('review team restored',r.status === 200);
  await auth.prepare(`UPDATE users SET status = 'suspended' WHERE id = ?`).run(otherManager.id);
  r = await request('GET','/crm/enquiries',outsideToken);
  check('suspended token immediately rejected',r.status === 401);
  let constraintRejected = false;
  try { await agentDb.prepare(`UPDATE crm_enquiries SET budget_paise = -1 WHERE id = ?`).run(enquiryId); } catch(e) { constraintRejected = e.code === '23514'; }
  check('database rejects negative budget',constraintRejected);
  let fkRejected = false;
  try { await agentDb.prepare(`UPDATE crm_enquiries SET customer_user_id = ? WHERE id = ?`).run(randomUUID(),enquiryId); } catch(e) { fkRejected = e.code === '23503'; }
  check('database rejects missing customer',fkRejected);
  const uploadsDir = fs.existsSync(path.resolve('uploads')) ? path.resolve('uploads') : path.resolve('apps/api/uploads');
  // The private-document checks below need a real stored file to serve. `key`
  // is that file's name and was never defined, so this script always crashed
  // here before any of the access-control assertions ran.
  const key = `${randomUUID()}.png`;
  const privateFile = path.resolve(uploadsDir, key);
  fs.mkdirSync(path.dirname(privateFile), { recursive: true });
  fs.writeFileSync(privateFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
  await auth.prepare(`INSERT INTO kyc_documents (id,user_id,doc_type,file_url,created_at,updated_at,created_by) VALUES (?, ?, 'id_proof', ?, ?, ?, ?)`)
    .run(randomUUID(),customer.id,`/uploads/${key}`,new Date().toISOString(),new Date().toISOString(),customer.id);
  r = await request('GET',`/uploads/${key}`);
  check('private KYC anonymous access denied',r.status === 404);
  r = await request('GET',`/uploads/${key}`,strangerToken);
  check('private KYC foreign customer access denied',r.status === 404);
  const fileResponse = await fetch(base+`/uploads/${key}`,{headers:{Authorization:`Bearer ${customerToken}`}});
  check('private KYC owner can fetch bytes',fileResponse.status === 200 && fileResponse.headers.get('cache-control') === 'private, no-store' && (await fileResponse.arrayBuffer()).byteLength > 0);
  const quoted = await request('POST','/crm/enquiries',customerToken,{...enquiry,subject:'Browser review enquiry'});
  await request('PATCH',`/crm/enquiries/${quoted.data.id}`,adminToken,{manager_user_id:manager.id,agent_user_id:field.id,status:'quoted',quote_paise:1000000,quote_note:'Review quote; booking requires owner approval'});
  const review = {manager,customer,agent:{...field,password},admin:{...admin,access_token:adminToken},owner};
  fs.mkdirSync('.logs',{recursive:true});
  fs.writeFileSync('.logs/crm-review-credentials.json',JSON.stringify(review));
  console.log(`\n${checks} CRM checks passed. Review credentials saved to ignored local file.`);
} finally { await closeAll(); }
