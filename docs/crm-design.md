# Rental CRM design and decision log

## Approved understanding

- Extend the current platform, rather than rebuild it.
- Five roles: super_admin, manager, agent, car_owner, car_renter.
- Customer and renter mean the same person and use one portal/account.
- Owner lists a vehicle; renter requests a booking; owner accepts or rejects.
- Manager runs assigned agents and operational CRM, not payouts or platform settings.
- Preserve existing edits and business rules. No publishing or new paid integrations.

## Decisions

| Decision | Alternatives | Reason |
|---|---|---|
| Extend React/NestJS/PostgreSQL monorepo | Unified frontend; rebuild | Preserve working flows and reduce migration risk |
| Customer aliases renter | Six distinct roles; separate enquiry customer | User explicitly clarified they are the same |
| Separate manager Vite app | Reuse super-admin access | Clear portal boundary without granting financial privileges |
| CRM in agent schema | New database; reuse onboarding_leads | Existing onboarding leads create pending accounts; enquiries must not do this |
| Staff provisioned by super admin | Public manager signup | Prevent privilege escalation |
| One manager per agent | Many-to-many memberships | Unambiguous record ownership for first delivery |

## Assumptions and constraints

Single business, thousands of customer records, paginated CRM lists, responsive screens. No measured production capacity or uptime guarantee. Keep paise integers and UTC timestamps, audit staff changes, and migrate additively. Existing legacy rows must not be silently deleted to satisfy constraints. The monorepo remains the maintenance unit.

## Interfaces

- POST /auth/manager/login: manager-only credentials; no public manager signup.
- GET /crm/staff: admin gets available managers/agents; manager gets their agents.
- POST /crm/staff: super admin creates an active manager/agent with a temporary password.
- PUT /crm/team/:agentId: super admin assigns/removes manager ownership.
- GET /crm/enquiries?page=&pageSize=&search=&status=: scoped list + pagination.
- POST /crm/enquiries: renter creates enquiry; staff creates enquiry for an existing renter.
- PATCH /crm/enquiries/:id: staff assignment, stage, follow-up, quote; checks scope again inside transaction.
- GET /crm/enquiries/:id/activities: scoped activity history; internal notes hidden from renters.
- POST /crm/enquiries/:id/notes: staff adds internal follow-up note.
- POST /crm/enquiries/:id/accept: enquiry owner accepts a quoted price; this does NOT confirm a booking or charge money.

Admin sees all CRM; manager sees enquiries assigned to them or their current agents; agent sees their own assigned enquiries; renter sees enquiries they created. Owner has no CRM access. Assigned agents must belong to the enquiry manager. Manager reassignment of agents also moves that agent's enquiries in the same transaction. Unassigned renter enquiries go to the admin queue.

## Database model

Existing schemas: auth, fleet, booking, payment, agent, notification. Add manager role in auth. Add agent.manager_memberships (agent user primary key, manager user foreign key), agent.crm_enquiries (customer, manager, agent references, stage, requested dates, follow-up, optional quote), agent.crm_activities (enquiry reference, actor, type, internal/public visibility). Keep contact/identity on auth.users instead of duplicating it in CRM.

New tables use real foreign keys, checks, and indexes. Additional constraints on legacy booking/fleet/payment tables are NOT VALID initially: new writes are checked while existing rows are preserved. Validate legacy constraints only after an explicit integrity audit. Cross-schema foreign keys protect identity; module reads continue through services or existing database adapters. Cross-schema financial transactions remain an existing architectural limitation, not solved by this CRM change.

## Acceptance and testing

Five distinct portals, protected API role and record ownership, manager provisioning and team allocation, enquiry assignment/follow-up/quote acceptance, PostgreSQL migrations and relationship documentation, existing booking flow preserved, builds/typechecks, relevant API end-to-end checks, browser interactions and local preview. Tests must target a confirmed local database only; no hosted database mutation. No commit or deployment.

## Risks and boundaries

Legacy payment paths simulate ledger entries rather than verify a live payment provider. Existing upload links need authenticated document access. Existing frontend sessions use localStorage; this delivery is not a full cookie-session redesign. Test output must distinguish these limitations from verified CRM behavior.
