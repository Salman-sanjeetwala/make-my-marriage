# Make My Marriage — REST API Design

**Version:** 1.0 — V1  
**Status:** API design baseline  
**Date:** 14 November 2026  
**Backend:** NestJS controllers and services on Node.js  
**Frontend:** Angular 21  
**Database:** MongoDB Atlas / Mongoose  
**Validation:** Zod  
**Base path:** `/api`

## 1. Scope and authority

This document consolidates the user-supplied API proposal and the subsequent review, aligned with the finalized system architecture and database design. It supersedes conflicting Next.js references and historical implementation notes in the proposal.

This is a contract to implement, not evidence that endpoints have been built or tested. No existing application repository was audited and no services were provisioned.

Confirmed product rules:

- One current wedding membership per user; Admin and Manager roles.
- Only Admins administer members. Both roles manage other planning features.
- One Guest record represents one invitation with a maximum total party size.
- One RSVP status/headcount applies across all invited events; no per-event RSVP.
- Expenses only; no budgets or vendor payment schedules.
- Public events are explicitly selected. Gallery links remain private.
- Guests do not create accounts.

Defaults selected for this API baseline: archive restoration is deferred; guest invitation/gallery API calls carry dedicated token headers; browser sharing URLs remain unchanged. No `/api/v1` prefix is introduced.

## 2. Request boundaries

```text
HTTP request
 -> NestJS controller
 -> Session/capability authentication
 -> Wedding and role authorization
 -> Zod validation
 -> Domain service
 -> Repository / external provider adapter
 -> Explicit response projection
```

Controllers do not contain core business logic. Private wedding context comes from current membership, never from a client-supplied weddingId. Reject ownership fields in ordinary mutation bodies.

### Caller classes

| Label | Required access |
|---|---|
| Account | Valid organizer session; membership may be absent |
| Member | Valid session and current active wedding membership, Admin or Manager |
| Admin | Member with ADMIN role |
| Invitation | Valid `X-Invitation-Token` |
| Gallery | Valid `X-Gallery-Token`, enabled wedding gallery |
| Public | No credential, whitelisted published information only |
| Internal | Valid server-managed cron secret |

Cross-wedding IDs return 404, not an existence-revealing 403. Authenticated Managers invoking Admin-only operations receive 403.

## 3. Transport, authentication, and privacy

Use HTTPS and one application origin. Organizer sessions use a secure, HttpOnly, SameSite=Lax, host-scoped cookie, conceptually `mmm_session`. Angular never reads the session secret.

Cookie-authenticated mutations require an allowed Origin and a CSRF token supplied through `X-CSRF-Token`. Provide `GET /api/auth/csrf` to initialize or refresh a browser-bound token; return `{data:{csrfToken}}` with no-store. Apply the CSRF policy to login/signup/logout as well as authenticated writes. CSRF token generation/binding is an implementation security detail, not a custom cryptographic primitive.

Guest API requests use:

```text
X-Invitation-Token: <secret from /invite/:token>
X-Gallery-Token: <secret from /gallery/:token>
```

The browser obtains the token from the shared page URL and sends it only to the same-origin API. No organizer cookie is needed for these capabilities. Mutations accept strict JSON and validate Origin. Do not enable wildcard CORS. Do not persist capability tokens in localStorage.

Member-acceptance pages similarly use `/join/:token`, with `X-Member-Invitation-Token` on API requests. Acceptance also requires the matching authenticated account.

Redact capability headers, cookies, token-bearing page paths, password/reset bodies, and signed media URLs from application and platform logs. Use no-store for private data and sharing responses, no-referrer on token pages, and noindex for invitation/gallery pages. Non-indexing does not replace authorization.

Share links use a trusted configured `APP_ORIGIN`, not a request Host header. The encrypted gallery secret is decrypted only for authorized link/QR retrieval; it is not returned in ordinary wedding/gallery-settings responses.

## 4. Common contract conventions

### Response bodies

Single resource: `{ "data": { ... } }`.

Page list:

```json
{
  "data": [],
  "pagination": {"page": 1, "limit": 20, "total": 0, "totalPages": 0}
}
```

Photo cursor list:

```json
{
  "data": [],
  "pagination": {"nextCursor": null, "total": 0}
}
```

Action without a resource: `{ "data": { "success": true } }`. Do not mix this with top-level success objects. A 204 response has no body.

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields.",
    "details": {"attendingCount": "Cannot exceed the allowed party size."},
    "requestId": "opaque-request-id"
  }
}
```

Error details are optional; secrets, stack traces, and raw provider errors are excluded.

### Status mapping

| HTTP | Usage |
|---|---|
| 200 | Read/update/completed action |
| 201 | New resource or upload reservation |
| 202 | Accepted asynchronous work, such as queued email or deletion pending |
| 204 | Completed deletion with no body |
| 400 | Malformed input or field validation |
| 401 | Missing/expired organizer session |
| 403 | Insufficient role, rejected origin/CSRF, or disabled upload permission |
| 404 | Missing/inaccessible tenant resource or unavailable guest capability |
| 409 | Stale version or business-state conflict |
| 413 | Request/file declaration exceeds allowed size |
| 429 | Rate limit; include Retry-After when calculable |
| 502/503 | External provider/dependency unavailable |
| 500 | Unexpected internal failure |

Codes include VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, UPLOAD_ERROR, EXTERNAL_SERVICE_ERROR, INTERNAL_ERROR, EMAIL_ALREADY_EXISTS, ALREADY_HAS_WEDDING, LAST_ADMIN, INVITATION_EMAIL_MISMATCH, and PARTY_SIZE_CHANGED.

For public invitations/galleries, malformed, missing, revoked, deleted, or unavailable capabilities return the same 404 unavailable response. Reset/member invitation errors may distinguish INVALID_TOKEN and TOKEN_EXPIRED for recovery UX without disclosing unrelated records.

### Serialization and partial updates

- Return `id` and `version`; do not expose `_id`, `__v`, token hashes, ciphertext, or internal locks.
- Wedding/date-only task/expense fields use YYYY-MM-DD.
- Event timestamps are ISO 8601 with an explicit offset on input; return UTC ISO strings.
- Money uses integer paise, INR only. Validate safe integers and configured business limits.
- Omitted PATCH field means unchanged. Null clears a nullable field. `[]` clears an array. Normalize empty optional text to null; do not accept empty required text.
- Reject unknown and server-managed fields. Validate ObjectId strings before database queries.

### Optimistic concurrency

Return version on mutable resources and on public RSVP state. Require it in PATCH bodies and RSVP submissions. For DELETE/archive actions require `If-Match: "<version>"`. Missing versions return 400; stale different-state mutations return 409.

Nested wedding settings share Wedding's version. Their responses carry that version; concurrent unrelated settings changes may require refresh in V1. An identical already-applied RSVP may return current state after authorization, even if the submitted version is older. Internal server-only version checks are not a substitute for checking the client's last-read version.

### Pagination, limits, and search

Organizer lists default page=1, limit=20, maximum limit=100. Reject invalid/negative parameters. Events and member lists are bounded by configured wedding limits and may return unpaginated `{data:[]}`.

Photos default limit=24, maximum 48. Cursor is opaque and binds createdAt/_id order and event filter. A cursor used with a different filter returns 400.

Default order: events startsAt/id ascending; tasks createdAt/id descending; guests name/id ascending; expenses expenseDate/id descending; vendors name/id ascending; photos createdAt/id descending.

Search is escaped literal case-insensitive text, maximum 120 characters. No raw regex or arbitrary sort expression is accepted. Filters combine with AND.

Default JSON body limit is 8 KiB. Bulk selected-email requests allow up to 1,000 unique IDs and a 64 KiB body; otherwise 1,000 IDs would exceed the shared limit. File bytes are never submitted as JSON or through normal API routes.

## 5. Authentication endpoints

| Endpoint | Access | Request / result |
|---|---|---|
| GET `/api/auth/csrf` | Public, same-origin | Browser-bound csrfToken, no-store |
| POST `/api/auth/signup` | Public + CSRF | name, email, password; 201 user + hasWedding=false; set session cookie |
| POST `/api/auth/login` | Public + CSRF | email, password; 200 user + hasWedding; rotate/set cookie |
| POST `/api/auth/logout` | Browser + CSRF | Clear cookie and invalidate matching session; idempotent 200 success even if already expired |
| GET `/api/auth/me` | Account | user, membership or null, wedding summary or null |
| POST `/api/auth/forgot-password` | Public + CSRF | email; generic 200 success regardless of account existence |
| POST `/api/auth/reset-password` | Public + CSRF | token, password; 200 success; consume token and invalidate older sessions |

Signup/login responses expose user id, name, and email only. Invalid login returns a generic invalid-credentials error. Password validation and hashing follow security policy; never echo passwords.

`/auth/me` membership includes id and role; wedding includes id, couple names, weddingDate, and timeZone. Users without membership may create a wedding or accept an invitation, not access member routes.

Forgot-password provider failures must not turn the response into an account-existence oracle. Record sanitized failures internally and permit later retry. Reset clears the old session cookie; the user logs in again.

No signup email-verification flow exists.

## 6. Wedding and dashboard

| Endpoint | Access | Contract |
|---|---|---|
| POST `/api/wedding` | Account without membership | Create wedding and initial Admin atomically; 201 |
| GET `/api/wedding` | Member | Private safe wedding projection + version |
| PATCH `/api/wedding` | Member | Partial basic details + version; 200 |
| GET `/api/dashboard` | Member | Aggregated overview; 200 |

Create fields: brideName, groomName, weddingDate, timeZone (default Asia/Kolkata), location; optional title and description. Location supports formattedAddress, city, state, country, coordinates, and googlePlaceId subject to provider rules. Cover upload is a separate verified flow.

Create generates stable website.slug and gallery capability, but returns neither gallery secret nor ciphertext. Duplicate membership returns 409 ALREADY_HAS_WEDDING. Slug collision is resolved server-side.

Wedding PATCH permits names, title, description, date, timeZone, and location. It cannot modify membership, slug, secrets, deletion state, or upload ownership. Name/date edits preserve the slug.

Dashboard returns countdown in wedding timezone, active event/vendor counts, task total/completed counts, invitation counts by RSVP, totalPeopleAttending, totalExpensePaise, upcoming events, and upcoming tasks. It also returns eventAttendance: an array of {eventId, totalPeopleAttending} for every active wedding event, including zero totals. Sum attendingCount only for ATTENDING invitations whose invitedEventIds include that event. Pending and declined invitations contribute zero. Exclude archived events. Invitation counts and people are explicitly distinct; maximum capacity is not confirmed attendance. The wedding-wide total counts each attending invitation once and is never the sum of event totals.

## 7. Members and onboarding

| Endpoint | Access | Contract |
|---|---|---|
| GET `/api/members` | Member | Membership id, user id/name, role, joinedAt; email exposed only to Admin where needed |
| POST `/api/members/invitations` | Admin | email, role; 201 invitation + emailStatus |
| GET `/api/members/invitations` | Admin | Pending records, expiry and email status; no secret |
| DELETE `/api/members/invitations/:id` | Admin | If-Match; revoke; 204 |
| POST `/api/members/invitations/:id/resend` | Admin | version; replace invitation token/expiry and attempt email; 200 |
| GET `/api/public/member-invitation` | Member invitation header | Minimal intended email, role, couple names/date |
| POST `/api/member-invitations/accept` | Account + member invitation header + CSRF | Consume invitation, create membership; 200 membership/wedding summary |
| PATCH `/api/members/:id` | Admin | role + version; 200 |
| DELETE `/api/members/:id` | Admin | If-Match; remove and clear task assignments; 204 |

All membership mutations enforce final-Admin protection under concurrent requests. Only matching authenticated email plus invitation secret can accept. A user already belonging to another wedding receives 409. A retry after acceptance by that same account returns the existing result, rather than creating another membership.

Signup/login does not itself accept invitations. The frontend preserves the pending join token and calls accept after authentication, bypassing create-wedding onboarding.

An invitation record may be created even if email fails. Report emailStatus `ACCEPTED` or `FAILED` without claiming delivery, so the client knows to resend the existing invitation rather than create a duplicate. Expired PENDING invitations are revoked/reissued transactionally to satisfy the unique constraint.

Member removal ends wedding access but does not delete the User. Historical attribution uses User IDs. Task assignments become unassigned; the API does not expose dangling Former member assignments.

## 8. Events

| Endpoint | Access | Result |
|---|---|---|
| GET `/api/events` | Member | Active events by default; includeArchived boolean, optional from/to instants |
| POST `/api/events` | Member | 201 created Event |
| GET `/api/events/:id` | Member | Event + version, including archive state |
| PATCH `/api/events/:id` | Member | Partial editable fields + version |
| DELETE `/api/events/:id` | Member | If-Match; archive rather than hard delete; 200 Event |

Fields: name (required), optional preset type, startsAt (required), endsAt, venueName, address, description, dressCode, and isPublic (default false). The server validates the merged start/end pair and same-wedding context. Cover keys are not accepted through ordinary event mutations.

Archived events are read-only and excluded from public websites and all invitation pages. Existing organizer records retain their event association and archived label. Archive restoration is deferred in V1.

## 9. Tasks

| Endpoint | Access | Result |
|---|---|---|
| GET `/api/tasks` | Member | Paginated tasks |
| POST `/api/tasks` | Member | 201 Task |
| GET `/api/tasks/:id` | Member | Task + version |
| PATCH `/api/tasks/:id` | Member | Partial Task + version |
| DELETE `/api/tasks/:id` | Member | If-Match; hard delete; 204 |

Fields: title (1–200 characters), description (up to 2,000), assignedMembershipId, eventId, dueDate (YYYY-MM-DD), priority LOW/MEDIUM/HIGH, status TODO/IN_PROGRESS/COMPLETED. Defaults are MEDIUM and TODO. Optional references/date are nullable.

Filters: status, priority, eventId, assignedMembershipId, mine, dueDateFrom, dueDateTo. The optional due-date bounds are valid YYYY-MM-DD calendar dates, inclusive, and interpreted in the wedding calendar without UTC conversion. Either bound may be supplied; reject dueDateFrom after dueDateTo with 400 VALIDATION_ERROR. Tasks without a dueDate are excluded whenever a date bound is supplied. `eventId=none` selects general tasks; `assignedMembershipId=none` selects unassigned tasks. mine=true resolves the current membership. An explicit different assignee combined with mine=true yields no matches.

New references require current members and active same-wedding events. Existing archived event associations may be retained or cleared. completedAt is server-managed: set when entering COMPLETED and cleared when leaving it. Overdue means incomplete with dueDate before today's date in the wedding timezone.

## 10. Guests, sharing, and RSVP

| Endpoint | Access | Result |
|---|---|---|
| GET `/api/guests` | Member | Paginated guest invitations |
| POST `/api/guests` | Member | 201 Guest; generate but do not return stable secret |
| GET `/api/guests/:id` | Member | Guest details + version |
| PATCH `/api/guests/:id` | Member | Editable contact/capacity/event fields + version |
| DELETE `/api/guests/:id` | Member | If-Match; delete and cancel pending email jobs; 204 |
| GET `/api/guests/:id/invitation-link` | Member | `{data:{url}}`; no-store |
| PATCH `/api/guests/:id/rsvp` | Member | Manual RSVP update with version; 200 |
| GET `/api/guests/rsvp-summary` | Member | Invitation counts and total people attending |
| GET `/api/public/invitation` | Invitation | Minimal invitation view + version |
| POST `/api/public/invitation/rsvp` | Invitation | RSVP update with version; 200 |

Register static routes such as rsvp-summary before generic :id routes in NestJS routing configuration.

Guest fields: name (1–120), optional email (up to 254), phone (up to 40), notes (up to 2,000), maxGuests (integer, default 1, configured maximum), invitedEventIds (distinct, maximum 100). Empty selections are allowed during setup. Email is not unique. Reject raw token, RSVP, delivery, attribution, and ownership fields in normal CRUD mutations.

Filters: search, rsvpStatus, eventId, invitationSent. Default order name/id. Responses include invitedEvents summaries for organizer context; archived events are labeled. Secrets and normalized-email internals are omitted.

### Invitation response

```json
{
  "data": {
    "version": 2,
    "canRespond": false,
    "guest": {
      "name": "Rajesh Sharma",
      "maxGuests": 4,
      "rsvpStatus": "PENDING",
      "attendingCount": null
    },
    "wedding": {
      "brideName": "Princi",
      "groomName": "Akshay",
      "weddingDate": "2027-02-14",
      "timeZone": "Asia/Kolkata"
    },
    "events": []
  }
}
```

Events contain only active invited-event display fields: name, startsAt, endsAt, venueName, address, dressCode, and description. Do not expose other guests, internal notes, private contact records, or gallery tokens. canRespond is false if no active invited event remains, as illustrated above. For an invitation with active permitted events, return those events and canRespond=true.

### RSVP requests

```json
{"status":"ATTENDING","attendingCount":3,"version":2}
```

```json
{"status":"NOT_ATTENDING","attendingCount":0,"version":2}
```

ATTENDING requires 1 through maxGuests, including the named guest. NOT_ATTENDING requires 0. Public guests cannot reset to PENDING; the organizer endpoint may accept `{status:"PENDING",attendingCount:null,version:...}` to explicitly reopen a response.

Return saved status, attendingCount, updatedAt, and new version. One response covers all invited events. Capacity reduction below current attendance is rejected in normal Guest PATCH; the organizer first explicitly corrects RSVP.

A changed capacity/invitation or stale conflicting response returns 409 PARTY_SIZE_CHANGED/CONFLICT. Refresh without silently discarding the user's draft. Invalid tokens receive generic 404. Repeated identical responses still undergo access and rate-limit checks.

Summary fields: totalInvitations, pendingInvitations, attendingInvitations, notAttendingInvitations, totalPeopleAttending, and eventAttendance. eventAttendance uses the same active-event IDs, zero-inclusive totals, and invitation-level aggregation as the dashboard in §6. No maximum-capacity sum is labeled actual attendance, and event totals are never summed into the wedding-wide headcount.

## 11. Invitation delivery and batches

| Endpoint | Access | Contract |
|---|---|---|
| POST `/api/guests/:id/send-invitation` | Member | Immediate provider attempt; 200 emailStatus ACCEPTED |
| POST `/api/guests/:id/send-reminder` | Member | Email required and RSVP PENDING; 200 accepted |
| POST `/api/guests/actions/send-invitations` | Member | Queue eligible jobs; 202 |
| POST `/api/guests/actions/send-reminders` | Member | Queue pending-RSVP jobs; 202 |
| GET `/api/email-batches/:batchId` | Member | Wedding-scoped job totals/progress |
| POST `/api/email-batches/:batchId/retry-failed` | Member | Re-enable permitted failed jobs; 202 |

Bulk requests require an Idempotency-Key header. Reusing the same key and normalized request returns the same batch; using the key with another request returns 409. A deliberate resend uses a new key.

```json
{"scope":"SELECTED","guestIds":["<ObjectId>","<ObjectId>"]}
```

Invitations also support ALL_UNSENT; reminders support ALL_PENDING_RSVP. Selected reminders still require pending RSVP. Arbitrary serialized filters and client-supplied weddingIds are rejected.

```json
{
  "data": {
    "batchId": "opaque-batch-id",
    "status": "QUEUED",
    "requestedCount": 100,
    "eligibleCount": 94,
    "queuedCount": 94,
    "skipped": {"missingEmail": 4, "noActiveEvents": 2, "notPending": 0, "alreadySent": 0}
  }
}
```

Counts describe a fixed enqueue-time selection and must reconcile. Copying a link never marks an invitation sent. Invalid/missing/cross-wedding selected IDs reject the entire request with a non-disclosing 404 before queuing. Existing ineligible guests are skipped with counts. No eligible jobs returns 200, status NO_ELIGIBLE_RECIPIENTS, and batchId null.

### Durable request idempotency

Individual email-job uniqueness does not provide complete batch-request replay. Use the supporting email_batch_requests ledger specified in Database Design §117: weddingId, hashed client key, normalized request fingerprint, batchId, bounded immutable selection/eligibility snapshot, creation state, createdAt, and retention expiry. Unique weddingId/keyHash atomically establishes the first request. No invitation secrets are stored. Implement the collection and indexes through a reviewed migration.

Materialize jobs with stable recipient keys. A retry resumes the same snapshot and fills missing rows. Status polling can resume interrupted materialization. A reused key with different input returns 409. This is operational request metadata, not another wedding domain entity. Its specification does not imply that a collection has already been provisioned.

Retain the ledger at least as long as jobs and the supported retry horizon. Do not place external provider calls inside a transaction.

### Sending and retries

Before sending, recheck guest existence, email, invitation availability, and reminder eligibility. Cancel changed/deleted recipients rather than redirect a queued email. An already in-flight provider request cannot be unsent.

Missing email or no active events returns 409 for individual sends. Provider failure returns safe 502/503; only provider acceptance updates send timestamps. ACCEPTED is not guaranteed inbox delivery. Retry-failed requires a new request idempotency key and follows configured attempts/backoff.

Batch status includes creationStatus, total, pending, processing, sent, failed, cancelled, and completed. completed requires finished materialization and no pending/processing work. Scope every lookup to current weddingId.

WhatsApp sharing is a client-side action using the invitation URL, not an automated sending endpoint.

## 12. Expenses

| Endpoint | Access | Contract |
|---|---|---|
| GET `/api/expenses` | Member | Paginated; category/eventId/vendorId/from/to filters |
| POST `/api/expenses` | Member | 201 Expense |
| GET `/api/expenses/summary` | Member | totalExpensePaise, currency, byCategory |
| GET `/api/expenses/:id` | Member | Expense + version |
| PATCH `/api/expenses/:id` | Member | Partial fields + version |
| DELETE `/api/expenses/:id` | Member | If-Match; hard delete; 204 |

```json
{
  "title": "Photography expense",
  "amountPaise": 5000000,
  "currency": "INR",
  "expenseDate": "2026-11-14",
  "category": "PHOTOGRAPHY",
  "eventId": null,
  "vendorId": null,
  "notes": "Agreed expense"
}
```

Server sets createdByUserId. Require positive safe-integer paise and a valid date-only expenseDate. INR is the only currency. Categories: VENUE, CATERING, PHOTOGRAPHY, VIDEOGRAPHY, DECORATION, CLOTHING, JEWELLERY, ENTERTAINMENT, INVITATIONS, GIFTS, TRAVEL, MAKEUP, OTHER.

New references require active same-wedding targets; historical archived relationships can be retained or cleared. Summary accepts the applicable list filters. Totals represent recorded spending/commitments, not payments or outstanding balances. Vendor agreed costs do not automatically enter totals.

## 13. Vendors and discovery

| Endpoint | Access | Contract |
|---|---|---|
| GET `/api/vendors` | Member | Paginated; category/search/includeArchived |
| POST `/api/vendors` | Member | Manual vendor; 201 |
| POST `/api/vendors/from-place` | Member | googlePlaceId and optional organizer fields; 201 |
| GET `/api/vendors/:id` | Member | Vendor + version |
| PATCH `/api/vendors/:id` | Member | Partial fields + version |
| DELETE `/api/vendors/:id` | Member | If-Match; archive; 200 Vendor |
| GET `/api/vendor-discovery/search` | Member | Backend provider search |

Fields: name, category, optional contactPerson/phone/email/address/website, totalAgreedCostPaise, eventIds, notes. eventIds defaults to []; allow zero or more distinct, bounded same-wedding event references so vendors can be saved before events are assigned. New references require active events. Manual creation sets source=MANUAL; discovery creation sets GOOGLE_PLACES and validates the place through the backend adapter.

Retain only provider-permitted fields, with provenance and attribution. Fetching trusted data does not grant unlimited storage rights. Organizer-supplied records remain usable during discovery outages.

Search accepts optional category, optional query, and an optional latitude/longitude pair. Require at least one valid category or nonempty trimmed query; both may be supplied. Reject missing search criteria, invalid coordinates, or a partial coordinate pair with 400 VALIDATION_ERROR. Without an override, use the wedding coordinates; missing usable coordinates also returns 400 VALIDATION_ERROR. Bound query/radius/results server-side. Return required place fields and attribution metadata, not entire provider payloads.

Archived vendors are read-only; historical expenses still resolve them. Restoration is deferred. Do not silently merge duplicates or impose unspecified place-ID uniqueness.

## 14. Website and livestream

| Endpoint | Access | Contract |
|---|---|---|
| GET `/api/wedding/website` | Member | slug, theme, isPublished, welcomeMessage, version |
| PATCH `/api/wedding/website` | Member | theme/welcomeMessage/isPublished + version |
| GET `/api/public/weddings/:slug` | Public | Published safe model; unavailable/unpublished returns 404 |
| GET `/api/wedding/livestream` | Member | youtubeUrl, isEnabled, version |
| PATCH `/api/wedding/livestream` | Member | youtubeUrl/isEnabled + version |

Themes: CLASSIC, MINIMAL, MODERN. Slug is read-only. Publication is an explicit settings update.

Public responses contain couple identity, date/timeZone, welcome content, safe cover URL, theme, active isPublic=true events, and enabled livestream. Exclude guest details, private events, internal records, and gallery URLs. A gallery-enabled flag is not photo authorization.

Enable livestream only with a supported valid YouTube URL. Remove using youtubeUrl=null and isEnabled=false. Never accept arbitrary embed HTML. Playback failures do not unpublish the website.

## 15. Gallery sharing and settings

| Endpoint | Access | Contract |
|---|---|---|
| GET `/api/gallery/settings` | Member | isEnabled, guestUploadsEnabled, version; no secret |
| PATCH `/api/gallery/settings` | Member | flags + version; advance access generation as needed |
| GET `/api/gallery/link` | Member | data.url, stable decrypted gallery URL; no-store |
| GET `/api/gallery/qr` | Member | data.galleryUrl; Angular generates QR |
| GET `/api/public/gallery` | Gallery | Couple summary, upload flag, safe event/group labels |
| GET `/api/public/gallery/photos` | Gallery | Cursor list of READY images |

Sharing endpoints retrieve the same encrypted gallery capability and do not rotate it. No QR database entity exists. Disabled gallery returns generic 404; uploads disabled with viewing enabled returns 403 UPLOADS_DISABLED only for upload operations.

No token-rotation endpoint is required in V1; emergency operational rotation invalidates old QR codes. Archived groups with photos may retain gallery labels without exposing ceremony times/venues. Upload selectors list active events only. Existing photos remain accessible when their event is archived.

## 16. Photo upload and viewing

Media bytes transfer directly between browser and R2. APIs authorize, verify, finalize, list, or delete storage references.

| Endpoint | Access | Contract |
|---|---|---|
| GET `/api/photos` | Member | READY cursor list |
| POST `/api/photos/upload-url` | Member | 201 reservation + signed PUT URL |
| POST `/api/photos/:uploadId/confirm` | Member | 200 READY photo; idempotent |
| GET `/api/photos/:photoId/download` | Member | Newly signed attachment URL |
| DELETE `/api/photos/:photoId` | Member | If-Match; 204 completed or 202 deletion pending |
| POST `/api/public/gallery/upload-url` | Gallery | 201 guest reservation |
| POST `/api/public/gallery/uploads/:uploadId/confirm` | Gallery | 200 READY gallery-safe photo |

Do not retain the old POST /api/photos metadata-creation operation. A server-issued reservation is mandatory; an object key with a wedding prefix is not authorization.

### Upload authorization

```json
{
  "filename": "IMG_1001.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 5283912,
  "eventId": null
}
```

Accept JPEG, PNG, WebP from 1 byte through 10 MiB. No SVG, video, or HEIC conversion. UI batch selection is capped at 20 files; each authorization reserves one image. Initial uploads are sequential.

```json
{
  "data": {
    "uploadId": "<ObjectId>",
    "uploadUrl": "<signed-R2-URL>",
    "method": "PUT",
    "headers": {"Content-Type": "image/jpeg"},
    "expiresAt": "2026-11-14T10:10:00.000Z",
    "confirmationDeadline": "2026-11-15T10:10:00.000Z"
  }
}
```

PUT authorization lasts 10 minutes. Sign supported metadata constraints including expected length where supported; browser-managed headers must not be set through prohibited JavaScript APIs. Always verify actual object length/type on confirmation.

Reject weddingId, uploader identity, and client-selected storage keys. An event must be active and in the wedding at issuance. Bind reservation to member identity or the authorized gallery generation.

### Confirmation

Confirmation uses an empty JSON body. Read the reserved filename, MIME, size, and event from persistence rather than trusting resubmitted metadata.

Recheck access; inspect actual length/MIME/format signature; pin the same ETag; conditionally copy to an independent final key. Publish READY using the fenced database finalization claim. Format-signature checking is not full decoding or malware scanning.

PENDING uploads may confirm until 24 hours after PUT expiry. A different member cannot take over a pending member upload merely by knowing its ID. Guest confirmation requires the matching gallery capability/generation. An event archived after issuance does not discard an otherwise valid historical photo association.

Repeated READY confirmation returns the same photo. A competing active finalization returns 409 UPLOAD_IN_PROGRESS and a retry hint. Invalid bytes return 400 UPLOAD_ERROR; excessive size 413; dependency failure 503. No failed validation publishes a photo.

### Listing and downloads

Photo fields: id, eventId, originalFilename, mimeType, sizeBytes, uploaderType, createdAt, url, urlExpiresAt, version. Public responses omit unnecessary internal/uploader data. No credentials or staging keys appear.

Filters use eventId or eventId=other for Wedding Memories. Default limit 24, maximum 48. Cursor binds createdAt/_id and the event filter. Only READY photos appear. Signed read URLs last 15 minutes; metadata responses use no-store.

Initial browsing uses lazy-loaded originals. Downloads return data.url and expiresAt, signed with attachment disposition. Renew expired URLs through an authorized API call. No thumbnail-generation or binary-proxy behavior is promised.

### Deletion

DELETE first fences the record as DELETING. Resolve active finalization, delete known objects, and retain a hidden DELETED tombstone. A late confirmer cannot republish it.

Return 204 when defined cleanup is confirmed. Return 202 with data.status=DELETING and retryAfterSeconds while known work prevents completion. Retrying DELETE is safe; already DELETING/DELETED resources return current progress/completion after authorization rather than fail solely because the original version is old.

Storage failure returns safe 503; the record remains hidden and retryable. An unexpired PUT can recreate staging bytes and ambiguous copies may leave orphans. This contract does not claim an automatic reconciliation worker or elimination of all residual objects.

## 17. Wedding and event covers

Covers remain embedded storage-key references, not gallery Photo records. They require verified confirmation rather than accepting arbitrary object keys in ordinary PATCH requests.

| Endpoint | Access | Contract |
|---|---|---|
| POST `/api/wedding/cover/upload-url` | Member | filename/mimeType/sizeBytes + version; 201 grant |
| POST `/api/wedding/cover/confirm` | Member | uploadToken + version; verify/set cover |
| DELETE `/api/wedding/cover` | Member | If-Match; clear reference and clean previous object |
| POST `/api/events/:id/cover/upload-url` | Member | Same grant; active same-wedding event |
| POST `/api/events/:id/cover/confirm` | Member | uploadToken + version; verified update |
| DELETE `/api/events/:id/cover` | Member | If-Match; clear and clean cover |

A signed expiring uploadToken binds actor, wedding, target, purpose, staging key, metadata, and target version. Verify bytes and copy to a server-only final key before setting the embedded cover reference. A stale target version cannot replace a newer cover.

For retry-safe confirmation, use the bounded embedded pending-cover grant/operation markers and last-confirmed operation marker on Wedding/Event specified in Database Design §118. Only the current recorded grant may confirm; completed matching retries return the saved result. Replaced grants cannot overwrite current content. Implement these fields through reviewed schema changes; this document does not claim that they already exist in a running database.

The grant response includes uploadUrl, browser headers, uploadToken, expiry, and the target's resulting version. Confirm returns updated cover URL and resulting version. Cleanup follows the conservative external-operation rules for photos: return 200 after confirmation; cover deletion returns 204 when complete or 202 with cleanup pending. Retries do not delete a newer replacement.

A public cover is intentionally viewable with published content. Private gallery originals are never silently repurposed.

## 18. Internal email processor

GET `/api/internal/jobs/email` — Internal only.

Vercel Cron makes a GET request to the configured production route. Require the server cron secret, use no-store, and never authorize with an organizer cookie. [Vercel Cron behavior](https://vercel.com/docs/schedules/cron-jobs)

Flow: authenticate, recover expired claims, atomically claim bounded due work, call Resend, persist fenced results. Stop within runtime/provider limits. No unbounded loop or untracked work after responding.

```json
{"data":{"claimed":50,"accepted":47,"retryScheduled":2,"failed":1}}
```

Database completion requires the same lock owner. Provider idempotency helps supported retry windows, but exactly-once delivery is not guaranteed. An infrequent Vercel cron schedule means delayed processing even when nextAttemptAt is earlier.

## 19. Cross-cutting edge cases

- Accounts without membership access onboarding/account operations only.
- Soft-deleted weddings are unavailable to ordinary member, public, and guest operations.
- Archived references cannot be newly assigned; historical organizer associations remain readable.
- Public capability failures are generic; independent abuse controls protect invalid-token traffic.
- Preserve unsaved RSVP choices across retryable errors while refreshing current capacity/version.
- Keep selected upload files in same-tab memory during reauthentication; clear them if identity/wedding changes.
- Dependency failures do not disable unrelated planning functionality.
- Provider payloads and secrets are not exposed through logs/errors.
- Sharing links use configured APP_ORIGIN, not untrusted request host information.

## 20. Security and validation matrix

| Area | Required controls |
|---|---|
| Authentication | Password hashing, generic failures, rate limits, session rotation/revocation |
| Organizer mutations | Cookie, CSRF, Origin, current membership, ownership, version |
| Admin operations | Current role and final-Admin concurrency protection |
| Guest RSVP | Invitation header, active wedding, capacity/version, per-token/shared throttles |
| Gallery | Gallery header, availability/access generation, upload reservation binding |
| Media | Narrow signed URLs, validation, publication/deletion fences, no public cache |
| Batch email | Wedding scope, request replay ledger, fixed selection, current-recipient checks |
| Cron | Internal secret, bounded work, leased claims |
| Public website | Published status, public events, safe projections |

Initial RSVP policies may use 20 requests per invitation per 15 minutes and 300 valid submissions per minute globally. Initial organizer upload issuance may use 120 per member per 15 minutes followed by 600 per wedding per 15 minutes. Thresholds remain configurable; guest upload limits use capability/wedding scopes, not fabricated member identities. Rate limits do not enforce storage quotas.

Malformed IDs return 400; valid inaccessible IDs return 404. Bound strings, arrays, headcounts, search, and pagination with shared validators. Endpoint-specific bulk body limits do not remove global controls.

## 21. Contract testing

Required checks:

1. Every private lookup derives tenant context from membership.
2. Mutations follow documented role and version rules.
3. Managers cannot administer members but retain other agreed permissions.
4. RSVP remains invitation-level, with PENDING=null and declined=0.
5. Private/archived events are excluded from the correct public/guest projections.
6. Removing a member clears task assignment and subsequent access.
7. Repeating a batch request after partial insertion returns the same selection/batch.
8. Changed/deleted guests cancel stale queued email where no send is already in flight.
9. Confirmation cannot publish arbitrary keys or another member's reservation.
10. Photo deletion racing confirmation cannot resurrect an image.
11. Cover retries cannot overwrite a newer cover or bypass validation.
12. Secret headers and page paths are redacted; private responses are no-store.
13. Date-only values do not shift across timezone conversions.
14. Resources/actions/204 responses follow one envelope policy.
15. Cron method and secret validation match actual deployment configuration.

Generate an OpenAPI specification from the implemented NestJS contract and keep it synchronized with tests, including security headers, cookies, CSRF, errors, and examples. OpenAPI generation is a follow-on deliverable, not performed here.

## 22. Differences from the supplied proposal

- NestJS replaces Next.js references; /api remains the base path.
- Guest browser links retain tokens; guest API calls use dedicated headers.
- Manual organizer RSVP and client-visible versions are included.
- Task/expense dates are date-only; historical attribution uses User IDs.
- Events expose isPublic and archival excludes guest itinerary display.
- Gallery secrets use encrypted retrieval plus hash lookup; normal settings exclude them.
- Upload confirmation refers to reserved uploads; deletion uses a publication fence.
- Covers require verified, retry-safe confirmation.
- Queued email uses 202 and a supporting request-idempotency ledger.
- Cron uses authenticated GET.
- Archived event/vendor restoration is deferred.
- Historical implementation notes do not establish tested functionality or exclude remaining V1 features.

## 23. Persistence alignment and next steps

Database Design §§117–118 specifies the supporting email_batch_requests ledger and embedded cover-operation markers required by these contracts. The 13 primary collections and simplified invitation-level RSVP model remain unchanged; there are two supporting infrastructure collections. Implementation still requires reviewed migrations/schema changes and verification.

Next work: application/module architecture, Angular routes and state, and deployment/security configuration. Exact session lifetimes, body/string/headcount bounds not already specified, storage quotas, and provider limits remain deployment parameters.

This document defines the V1 API baseline. It does not deploy endpoints, send invitations, or modify the supplied source files.
