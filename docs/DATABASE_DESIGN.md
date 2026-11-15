# Make My Marriage
## Final Database Design Document

**Version:** 1.0 — V1  
**Database:** MongoDB Atlas  
**ODM:** Mongoose  
**Validation:** Zod + Mongoose  
**Primary Tenant:** Wedding  
**Status:** Final Database Design Baseline  
**Date:** 14 November 2026

---

# 1. Purpose and authority

This document finalizes the user-provided database proposal and the subsequent review. It supersedes the earlier assistant-generated database draft. It follows the Angular 21 / NestJS architecture with MongoDB Atlas, private Cloudflare R2, Resend, and Google Places.

It defines collections, relationships, fields, indexes, tenant isolation, token handling, deletion, and concurrency. Detailed API payloads and executable Mongoose schemas remain separate implementation work.

The approved model has **one Guest invitation, one RSVP status, and one attending count across all invited events**. There are no household rosters, per-event RSVPs, budget records, or vendor payment schedules.

This is a design document, not a claim that database migrations or application code have been executed. Earlier dated implementation notes are incorporated as design behavior where relevant, without asserting verification.

---

# 2. Database Design Principles

## 2.1 Wedding is the Tenant

Almost every domain entity belongs to a Wedding.

Examples:

```text
Event        → weddingId
Task         → weddingId
Guest        → weddingId
Vendor       → weddingId
Expense      → weddingId
Photo        → weddingId
```

Every private query should include the current authenticated Wedding.

---

## 2.2 Do Not Create One Giant Wedding Document

Avoid:

```javascript
Wedding {
    guests: [1000 guests],
    photos: [5000 photos],
    tasks: [...],
    events: [...],
    expenses: [...],
    vendors: [...]
}
```

Large and continuously growing collections belong in separate MongoDB collections.

---

## 2.3 Embed Small Bounded Configuration

Information with a strict 1:1 relationship to a Wedding can be embedded.

Examples:

```text
Wedding
├── location
├── website settings
├── gallery settings
└── livestream settings
```

These objects are small and always loaded together with the Wedding.

---

## 2.4 Reference Growing Data

Use references for:

```text
Events
Tasks
Guests
Vendors
Expenses
Photos
Memberships
Email Jobs
```

---

## 2.5 Denormalize Only When Useful

For V1, avoid maintaining counters such as:

```text
wedding.totalGuests
wedding.completedTasks
wedding.totalExpenses
```

These can initially be calculated from indexed collections.

At much larger scale, selective counters can be introduced.

---

# 3. Collection Overview

The initial database contains the following major collections:

```text
users

sessions
password_reset_tokens

weddings
wedding_memberships
wedding_member_invitations

events
tasks

guests

vendors
expenses

photos

email_jobs
```

There is intentionally no separate collection for:

```text
Wedding Website
Gallery
Livestream
Guest Invitation
RSVP
```

because these have natural 1:1 relationships with an existing entity and can be represented without additional collections.

---

# 4. High-Level Relationship Diagram

```text
                               User
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
              Session                  WeddingMembership
                                               │
                                               ▼
                                            Wedding
                                               │
                 ┌───────────┬─────────────────┼─────────────────┐
                 │           │                 │                 │
                 ▼           ▼                 ▼                 ▼
               Event       Guest             Vendor           Expense
                 │           │                 │                 │
                 │           │                 └───────┐         │
                 │           │                         │         │
                 ▼           │                         ▼         │
               Task          │                      Expense ◄────┘
                             │
                             ▼
                      Invitation + RSVP
                       embedded in Guest


                                            Wedding
                                               │
                                               ▼
                                             Photo
                                               │
                                               ▼
                                        Cloudflare R2


                                            Wedding
                                               │
                                               ▼
                                           EmailJob
```

---

# 5. ID Strategy

MongoDB `ObjectId` will be used for internal entities.

Example:

```text
_id: ObjectId
```

We do not need:

- Auto-increment IDs
- Numeric IDs
- UUIDs for normal internal database entities

Publicly shared resources should use random tokens rather than ObjectIds.

Examples:

```text
Guest invitation → random secret token

Gallery access → random secret token

Password reset → random secret token

Session → random secret token
```

Wedding website uses a human-readable slug.

---

# 6. Common fields and conventions

Most domain documents use `_id: ObjectId`, `createdAt: Date`, and `updatedAt: Date`. Wedding-owned documents include immutable `weddingId`.

- Store instants as BSON Date in UTC.
- Store weddingDate, task dueDate, and expenseDate as validated YYYY-MM-DD strings.
- Store money as integer paise, validate safe-integer bounds, and bound aggregate totals. Mongoose Number does not enforce integer semantics by itself.
- Use `__v`, initially 0, for optimistic concurrency on mutable domain records. Update queries must explicitly filter/increment it when applicable; do not assume Mongoose does this for every query method.
- Default archivedAt/deletedAt to null consistently. Active queries include the matching null predicate.
- Optional references may be null; arrays are deduplicated and bounded.
- Sensitive fields use default exclusion plus explicit response allowlists. Default selection alone is not authorization, especially with aggregation or direct collection access.
- Zod handles input shape, services enforce domain rules, Mongoose protects structure, and MongoDB indexes enforce uniqueness.

---

# 7. Users Collection

## Collection

```text
users
```

Represents authenticated Wedding Members.

Guests never appear in this collection.

---

## Suggested Schema

```javascript
User {
    _id: ObjectId,

    name: String,

    email: String,
    emailNormalized: String,

    passwordHash: String,
    credentialVersion: Number, // Default 0; invalidates earlier credentials.

    createdAt: Date,
    updatedAt: Date
}
```

---

## Email Normalization

Always retain both:

```text
email
emailNormalized
```

Example:

```text
email:
"Akshay.Saini@gmail.com"

emailNormalized:
"akshay.saini@gmail.com"
```

At minimum normalization should:

```text
trim whitespace
convert to lowercase
```

Do not implement provider-specific transformations such as Gmail dot removal.

---

## Indexes

```javascript
unique(emailNormalized)
```

This ensures a single account per email.

---

# 8. Important Authentication Tradeoff

V1 intentionally does **not require email verification**.

Therefore:

```text
Signup
→ account immediately active
```

This simplifies onboarding but means the application does not independently prove that the registrant owns the email address.

This is an accepted V1 product decision.

Password-reset emails still require control of the email account.

---

# 9. Sessions Collection

## Collection

```text
sessions
```

Used for server-side authentication sessions.

---

## Suggested Schema

```javascript
Session {
    _id: ObjectId,

    userId: ObjectId,

    tokenHash: String,
    credentialVersion: Number,

    expiresAt: Date,

    createdAt: Date,

    lastUsedAt: Date?
}
```

The raw session token is stored only inside the browser cookie.

MongoDB should store its hash.

---

# 10. Session token strategy

Generate a high-entropy opaque token using a cryptographically secure generator. Store the raw token only in the browser's secure, HttpOnly cookie. Persist a purpose-separated HMAC-SHA-256 tokenHash, using a server-managed key outside MongoDB.

A request is authenticated only when the token matches, expiresAt is in the future, and Session.credentialVersion equals User.credentialVersion. Session role and weddingId are not authoritative stored claims: resolve current membership on protected requests.

Logout deletes the session. Password reset increments User.credentialVersion, invalidating all older sessions even before cleanup. HMAC key rotation requires a controlled overlap or deliberate session invalidation; document the deployment policy.

TTL is cleanup, never the session-validity check.

---

# 11. Session Indexes

```javascript
unique(tokenHash)

index(userId)

TTL(expiresAt)
```

MongoDB's TTL index can automatically remove expired sessions.

---

# 12. Password reset tokens

Collection: `password_reset_tokens`.

```javascript
PasswordResetToken {
    _id: ObjectId,
    userId: ObjectId,
    tokenHash: String,
    credentialVersion: Number,
    expiresAt: Date,
    usedAt: Date | null,
    createdAt: Date
}
```

Indexes: unique(tokenHash), index(userId), TTL(expiresAt) with expireAfterSeconds: 0.

Use a random, purpose-separated HMAC-hashed token. Claim it with usedAt null and expiresAt greater than now. In one transaction, consume the token, replace the password hash, and increment the user's credentialVersion after checking the version recorded in the reset token. This also invalidates other reset tokens issued against the older credential version.

Do not send email or call external providers inside the transaction. Never persist raw reset secrets in email jobs.

---

# 13. Weddings Collection

## Collection

```text
weddings
```

This is the central tenant collection.

---

## Suggested Schema

```javascript
Wedding {
    _id: ObjectId,

    brideName: String,
    groomName: String,

    title: String?,
    description: String?,

    weddingDate: String,

    timeZone: String,

    coverImageObjectKey: String?,

    location: {
        formattedAddress: String?,
        city: String?,
        state: String?,
        country: String?,

        latitude: Number?,
        longitude: Number?,

        googlePlaceId: String?
    },

    website: {
        slug: String,

        theme: String,

        isPublished: Boolean,

        welcomeMessage: String?
    },

    gallery: {
        tokenHash: String,
        tokenCiphertext: String,
        tokenEncryptionKeyId: String,
        accessVersion: Number,

        isEnabled: Boolean,

        guestUploadsEnabled: Boolean
    },

    livestream: {
        youtubeUrl: String?,
        isEnabled: Boolean
    },

    createdByUserId: ObjectId,

    membershipRevision: Number, // Default 0; membership transaction fence.
    referenceRevision: Number, // Default 0; reference/archive transaction fence.

    deletedAt: Date?,

    createdAt: Date,
    updatedAt: Date
}
```

---

# 14. Wedding Date

The primary wedding date should be stored as a **date-only value**:

```text
YYYY-MM-DD
```

Example:

```text
2027-02-14
```

rather than pretending it has a specific time.

This avoids timezone-related changes such as:

```text
14 February
becoming
13 February
```

during UTC conversion.

---

# 15. Wedding Timezone

Store:

```text
timeZone
```

Example:

```text
Asia/Kolkata
```

Event timestamps can then be rendered correctly.

Even though V1 primarily targets Indian weddings, explicit timezone storage prevents hidden assumptions throughout the application.

---

# 16. Wedding Location

Wedding location is embedded because it belongs directly to one Wedding.

Example:

```javascript
location: {
    formattedAddress: "Dehradun, Uttarakhand, India",
    city: "Dehradun",
    state: "Uttarakhand",
    country: "India",

    latitude: 30.3165,
    longitude: 78.0322,

    googlePlaceId: "..."
}
```

This supports:

- Display
- Maps
- Vendor discovery
- Nearby searches

---

# 17. Wedding Website Data

The wedding website does not require its own collection.

It has a strict 1:1 relationship with the Wedding.

Embed:

```javascript
website: {
    slug,
    theme,
    isPublished,
    welcomeMessage
}
```

---

# 18. Wedding Slug

Example:

```text
akshay-princi-14022027
```

Index:

```javascript
unique(website.slug)
```

If a collision occurs:

```text
akshay-princi-14022027-2
```

Once created, the slug remains stable.

Changing wedding names or wedding date should not automatically update it.

---

# 19. Wedding gallery configuration

Embed one gallery configuration in Wedding:

```javascript
gallery: {
    tokenHash: String,
    tokenCiphertext: String,
    tokenEncryptionKeyId: String,
    accessVersion: Number,
    isEnabled: Boolean,
    guestUploadsEnabled: Boolean
}
```

Store a digest for lookup and an authenticated-encrypted copy of the same random token for authorized retrieval. tokenCiphertext includes the nonce and authentication tag in a defined envelope; encryption keys stay outside MongoDB. Use a maintained authenticated-encryption implementation, not custom cryptography.

A hash alone cannot recreate the original sharing URL. The encrypted copy allows organizers to copy the same link and regenerate its QR code later. Public wedding projections never return any of these secret fields.

---

# 20. Gallery token lifecycle

Generate one high-entropy stable gallery token per wedding. Enforce a unique gallery.tokenHash index. Decrypt only in the organizer's authorized sharing/QR operation. Ordinary settings reads expose flags, not the token.

Disabling gallery access or uploads does not change the printed URL. Increment accessVersion when access policy changes, and capture it in guest upload grants so old grants cannot be finalized after revocation.

Explicit token rotation replaces both hash and ciphertext and increments accessVersion. It invalidates old QR codes. Rotation is an emergency operational recovery procedure in V1; no organizer self-service UI or API endpoint is included. Encryption-key rotation can re-encrypt the same token without changing the URL.

Gallery access remains private even if the wedding website is public. Do not put the secret URL into a public website response.

---

# 21. Livestream Data

Livestream is also a 1:1 Wedding property.

Embed:

```javascript
livestream: {
    youtubeUrl,
    isEnabled
}
```

No separate livestream collection is required.

---

# 22. Wedding Indexes

Recommended:

```javascript
unique(website.slug)

unique(gallery.tokenHash)

index(createdAt)
```

No geospatial MongoDB index is required initially because vendor discovery occurs through Google Places rather than internal geographic queries.

---

# 23. Wedding Memberships

## Collection

```text
wedding_memberships
```

Represents the relationship between authenticated Users and a Wedding.

---

## Suggested Schema

```javascript
WeddingMembership {
    _id: ObjectId,

    userId: ObjectId,

    weddingId: ObjectId,

    role: "ADMIN" | "MANAGER",

    joinedAt: Date,

    createdAt: Date,
    updatedAt: Date
}
```

---

# 24. Why Membership is Separate

We could store:

```text
user.weddingId
user.role
```

but a Membership collection better represents the domain.

It also allows future expansion to:

```text
one user → multiple weddings
```

without redesigning the entire database.

---

# 25. Membership constraints

V1 permits at most one current WeddingMembership per User.

Use `unique(userId)` to enforce this under concurrency. A second unique `(weddingId, userId)` index is redundant in V1 and is omitted. Keep `index(weddingId, role)` for member lists and Admin checks.

Accounts can exist without membership before onboarding or after removal. If multi-wedding membership is introduced later, replace the userId uniqueness rule through an explicit migration.

---

# 26. Membership indexes

```javascript
unique(userId)
index(weddingId, role)
```

The unique userId constraint must exist in MongoDB, not only in an application precheck.

---

# 27. Membership integrity and attribution

The database/service combination enforces:

- At least one Admin per active wedding.
- Only Admins invite, remove, or change member roles.
- At most one current membership per user.
- Access is rechecked against current membership, so removal takes effect on subsequent requests.

Serialize membership mutations by incrementing Wedding.membershipRevision in the transaction, then re-read authority and count remaining Admins before applying the change. All membership changes participate; a count-then-delete outside this protocol is unsafe under concurrency.

Before hard-deleting a membership, clear assignedMembershipId on its tasks in the transaction. Task assignment participates in the same membership fence to avoid racing removal.

Use User IDs for historical creation/upload attribution. Users remain in V1 after membership removal. Historical IDs never grant current access.

---

# 28. Wedding Member Invitations

## Collection

```text
wedding_member_invitations
```

Used before the invited person becomes a Wedding Member.

---

## Suggested Schema

```javascript
WeddingMemberInvitation {
    _id: ObjectId,

    weddingId: ObjectId,

    email: String,
    emailNormalized: String,

    role: "ADMIN" | "MANAGER",

    tokenHash: String,

    status:
        "PENDING"
        | "ACCEPTED"
        | "REVOKED",

    invitedByUserId: ObjectId,

    acceptedByUserId: ObjectId?,

    expiresAt: Date,

    acceptedAt: Date?,

    createdAt: Date,
    updatedAt: Date
}
```

Expired state can be derived from:

```text
status = PENDING
AND
expiresAt < now
```

We do not necessarily need to permanently mutate the status to `EXPIRED`.

---

# 29. Member invitation indexes and reissue

```javascript
unique(tokenHash)
index(weddingId, status)
index(emailNormalized)
index(expiresAt)
```

Also enforce unique `(weddingId, emailNormalized)` with `partialFilterExpression: {status: "PENDING"}`.

An expired PENDING row still participates in this index. Before reissuing, transactionally mark the previous PENDING invitation REVOKED, then insert the new token and expiry. Do not attempt a time-dependent partial-index filter.

Member tokens are not recoverable from hashes. Resending creates a new token, replacing the old invitation capability. Acceptance checks expiry independently of persisted status.

---

# 30. Invitation Acceptance

When an invite is accepted:

```text
Validate Token
    ↓
Validate Expiry
    ↓
Validate Signed-in User Email
    ↓
Ensure User Has No Existing Membership
    ↓
Create WeddingMembership
    ↓
Mark Invitation ACCEPTED
```

The membership creation and invitation update should happen atomically.

---

# 31. Events Collection

## Collection

```text
events
```

---

## Suggested Schema

```javascript
Event {
    _id: ObjectId,

    weddingId: ObjectId,

    name: String,

    type: String?,

    startsAt: Date,
    endsAt: Date?,

    venueName: String?,

    address: String?,

    description: String?,

    dressCode: String?,

    coverImageObjectKey: String?,

    isPublic: Boolean, // Default false; independent of archive state.

    archivedAt: Date?,

    createdAt: Date,
    updatedAt: Date
}
```

---

# 32. Event Type

`name` remains free-form.

Optional `type` can represent presets such as:

```text
ROKA
ENGAGEMENT
MEHENDI
HALDI
SANGEET
COCKTAIL
WEDDING
RECEPTION
CUSTOM
```

For a custom event:

```text
type = CUSTOM
name = "Family Dinner"
```

---

# 33. Event Timestamps

Event date/time should be stored as UTC timestamps:

```text
startsAt
endsAt
```

and rendered using:

```text
Wedding.timeZone
```

---

# 34. Event archiving and public visibility

Archive rather than cascade-delete events. Set archivedAt and retain references from tasks, guests, vendors, expenses, and photos.

- Archived events disappear from normal event lists, public websites, and all guest invitation pages, including previously shared invitation links.
- Existing organizer records retain the association and can display an Archived event label.
- New assignments cannot select archived events.
- Photos associated with an archived event remain available in the private gallery; the event's guest itinerary details remain hidden.
- Removing an event from active display does not reset the guest's invitation-level RSVP.

Store `isPublic: Boolean`, default false, separately from archivedAt. Only active events explicitly marked public appear on the public website.

---

# 35. Event Indexes

```javascript
index(weddingId, startsAt)

index(weddingId, archivedAt)
```

---

# 36. Tasks Collection

## Collection

```text
tasks
```

---

## Suggested Schema

```javascript
Task {
    _id: ObjectId,

    weddingId: ObjectId,

    title: String,
    description: String?,

    assignedMembershipId: ObjectId?,

    eventId: ObjectId?,

    dueDate: String?, // YYYY-MM-DD; no implied time of day.

    priority:
        "LOW"
        | "MEDIUM"
        | "HIGH",

    status:
        "TODO"
        | "IN_PROGRESS"
        | "COMPLETED",

    completedAt: Date?,

    createdAt: Date,
    updatedAt: Date
}
```

---

# 37. Why Assign to Membership Instead of User

Prefer:

```text
assignedMembershipId
```

over:

```text
assignedUserId
```

because assignment represents:

> this person acting as a member of this Wedding.

It also makes same-wedding validation explicit.

---

# 38. Task Integrity Rules

When assigning a task:

```text
Task.weddingId
must equal
Membership.weddingId
```

When linking an Event:

```text
Task.weddingId
must equal
Event.weddingId
```

MongoDB does not enforce foreign keys, so application services must enforce these rules.

---

# 39. Task Indexes

Recommended:

```javascript
index(weddingId, status)

index(weddingId, dueDate)

index(weddingId, assignedMembershipId, status)

index(weddingId, eventId)
```

---

# 40. Task Deletion

Tasks can be hard deleted.

They are leaf-level operational data and are not required as a dependency by other V1 modules.

---

# 41. Guests Collection

## Collection

```text
guests
```

One Guest record represents one invitation.

It does not represent every person in a family individually.

---

## Suggested Schema

```javascript
Guest {
    _id: ObjectId,

    weddingId: ObjectId,

    name: String,

    email: String?,
    emailNormalized: String?,

    phone: String?,

    maxGuests: Number,

    invitedEventIds: [ObjectId],

    notes: String?,

    invitationToken: String, // Stable share secret; excluded from ordinary reads.

    invitationSentAt: Date?,

    lastReminderSentAt: Date?,

    reminderCount: Number,

    rsvpStatus:
        "PENDING"
        | "ATTENDING"
        | "NOT_ATTENDING",

    attendingCount: Number | null,

    rsvpUpdatedAt: Date?,

    __v: Number, // Default 0; explicit optimistic concurrency.

    createdAt: Date,
    updatedAt: Date
}
```

---

# 42. Why Invitation Data Lives on Guest

V1 has:

```text
one Guest
→ one stable invitation link
→ one RSVP
```

Therefore a separate `guest_invitations` collection adds unnecessary complexity.

The Guest document naturally owns:

```text
invitationToken
email-send status
RSVP
```

If the product later supports multiple invitation versions, channels or detailed delivery histories, this can be separated.

---

# 43. Guest invitation token and concurrency

Generate a random 32-byte invitation token when the Guest is created. Retain it as the deliberate stable-sharing exception, with a unique index and default field exclusion. This allows organizers to retrieve the same sharing URL later.

Guest list/CRUD responses, exports, logs, and email-job payloads never contain the token. Only an authorized wedding-scoped sharing operation may return it. Public resolution projects only the invitation's permitted fields.

RSVP updates filter by guest ID, weddingId, token, current __v, and validated capacity, then increment __v while updating status, attendingCount, and rsvpUpdatedAt together. Organizer edits affecting capacity, invited events, or RSVP also increment __v. Do not silently truncate an existing response when capacity is reduced: reject the change or require an explicit valid revised response.

A repeated identical response can return current state after authorization. A conflicting stale response returns a conflict. Summary queries aggregate saved RSVP state and headcount, not maximum capacity. Rate-limit counters are separate supporting data.

---

# 44. Guest RSVP semantics

```javascript
// No response
rsvpStatus: "PENDING"
attendingCount: null

// Attending: named guest included in the total
rsvpStatus: "ATTENDING"
attendingCount: 3

// Declined
rsvpStatus: "NOT_ATTENDING"
attendingCount: 0
```

One saved response applies to every active invited event. Guests cannot provide different counts per event in V1. A maximum of four means four people total, including the named guest.

If no active invited events remain, preserve the existing response internally but disable new public RSVP submission until an active event is assigned.

---

# 45. RSVP constraints

Enforce the complete resulting document invariant:

- PENDING requires attendingCount null.
- ATTENDING requires an integer from 1 through maxGuests.
- NOT_ATTENDING requires attendingCount 0.
- maxGuests is a positive integer within a configured product bound.
- invitedEventIds is distinct, bounded, and references same-wedding events.

Use request validation and atomic service updates. A MongoDB collection validator can additionally enforce the status/count relationship. Cross-field invariants must not rely on a Mongoose field validator that sees only one changed update field.

---

# 46. Event-Level Invitations

Because the number of wedding events is small and bounded, Guest can contain:

```javascript
invitedEventIds: [ObjectId]
```

This is a good use of MongoDB embedding.

We do not need a join collection such as:

```text
guest_event_invitations
```

for V1.

---

# 47. Guest Indexes

Recommended:

```javascript
unique(invitationToken)

index(weddingId, rsvpStatus)

index(weddingId, name)

index(weddingId, emailNormalized)

index(weddingId, invitedEventIds)
```

Guest email should **not** be globally unique.

Two invitations may legitimately use:

- same family email
- shared household email

---

# 48. Guest deletion

Guests are hard deleted. Their invitation tokens immediately stop resolving.

In a transaction, delete the Guest and cancel its PENDING email jobs. PROCESSING workers must re-read guest existence, current recipient, and RSVP before sending and use fenced status updates afterward.

A provider request already in flight cannot be unsent; deletion invalidates its link even if an email subsequently arrives. Retain terminal email rows only for the configured support/deduplication window and remove unnecessary recipient data when permitted.

---

# 49. Vendors Collection

## Collection

```text
vendors
```

---

## Suggested Schema

```javascript
Vendor {
    _id: ObjectId,

    weddingId: ObjectId,

    name: String,

    category: String,

    contactPerson: String?,

    phone: String?,
    email: String?,

    address: String?,
    website: String?,

    totalAgreedCostPaise: Number?,

    eventIds: [ObjectId],

    notes: String?,

    source:
        "MANUAL"
        | "GOOGLE_PLACES",

    googlePlaceId: String?,

    archivedAt: Date?,

    createdAt: Date,
    updatedAt: Date
}
```

---

# 50. Money Storage

Do not store monetary values as arbitrary floating-point rupee amounts.

Instead use:

```text
integer minor units
```

For INR:

```text
₹1,234.50
=
123450 paise
```

Field:

```javascript
totalAgreedCostPaise
```

This avoids floating-point arithmetic problems.

---

# 51. Vendor Event Relationship

Allow zero or more event references, defaulting eventIds to an empty array so vendors can be saved before events are assigned. References must be distinct, bounded, and wedding-scoped; new associations require active events. Because each vendor can work at a small number of events:

```javascript
eventIds: [ObjectId]
```

is appropriate.

No vendor-event join collection is needed.

---

# 52. Google Places vendor data

Store source = GOOGLE_PLACES and the permitted googlePlaceId when a discovery result is selected. Preserve independently supplied organizer contact details as internal vendor data.

Do not assume all Places fields can be copied indefinitely. Provider-derived content must comply with applicable storage, refresh, and attribution rules. Distinguish organizer-supplied fields from provider-derived values during integration design. No extra permanent cache collection is required.

Manual vendor records remain usable if discovery is unavailable.

---

# 53. Vendor Indexes

Recommended:

```javascript
index(weddingId, category)

index(weddingId, archivedAt)

index(weddingId, googlePlaceId)
```

Optional partial uniqueness:

```text
One Google Place
per Wedding
```

can be enforced for non-null `googlePlaceId`.

---

# 54. Vendor Deletion

Vendors may be referenced by Expenses.

Therefore prefer:

```text
archive Vendor
```

rather than hard deletion.

Use:

```javascript
archivedAt
```

Existing expenses continue to point to the archived vendor.

---

# 55. Expenses Collection

## Collection

```text
expenses
```

---

## Suggested Schema

```javascript
Expense {
    _id: ObjectId,

    weddingId: ObjectId,

    title: String,

    amountPaise: Number,

    currency: "INR",

    expenseDate: String, // YYYY-MM-DD in wedding calendar.

    category: String,

    eventId: ObjectId?,

    vendorId: ObjectId?,

    notes: String?,

    createdByUserId: ObjectId,

    createdAt: Date,
    updatedAt: Date
}
```

---

# 56. Expense Categories

Possible values:

```text
VENUE
CATERING
PHOTOGRAPHY
VIDEOGRAPHY
DECORATION
CLOTHING
JEWELLERY
ENTERTAINMENT
INVITATIONS
GIFTS
TRAVEL
MAKEUP
OTHER
```

A future version may support custom categories.

---

# 57. Expense integrity and attribution

Validate optional eventId and vendorId against the current wedding. Archived references remain readable for historical expenses but cannot be selected for new assignments.

`createdByUserId` records the acting registered user after current membership authorization. It remains meaningful if that membership is removed; it is not proof of current access.

Require positive safe-integer amountPaise and INR. expenseDate is YYYY-MM-DD. Aggregates sum recorded amounts only; vendor agreed costs never create or increase expenses implicitly.

---

# 58. Expense Indexes

Recommended:

```javascript
index(weddingId, expenseDate)

index(weddingId, category)

index(weddingId, eventId)

index(weddingId, vendorId)
```

For dashboard calculations:

```text
SUM(amountPaise)
WHERE weddingId = currentWedding
```

No denormalized total is necessary initially.

---

# 59. Expense Deletion

Expenses can be hard deleted in V1.

If audit/history requirements emerge later, soft deletion can be introduced.

---

# 60. Photos collection and lifecycle schema

Collection: `photos`. Actual files live in private R2. The collection is for gallery images only; cover keys remain embedded on Wedding/Event.

```javascript
Photo {
    _id: ObjectId,
    weddingId: ObjectId,
    eventId: ObjectId | null,
    uploadKey: String,             // Unique staging key, retained for recovery.
    objectKey: String,             // Staging while PENDING; final key when READY.
    originalFilename: String | null,
    mimeType: String,
    sizeBytes: Number,
    uploaderType: "MEMBER" | "GUEST",
    uploadedByUserId: ObjectId | null,
    galleryAccessVersion: Number | null,
    status: "PENDING" | "READY" | "DELETING" | "DELETED",
    expiresAt: Date,              // PUT authorization expiry.
    confirmationDeadline: Date,  // Initially expiresAt plus 24 hours.
    finalizationId: String | null,
    finalizationLeaseExpiresAt: Date | null,
    finalizationObjectKey: String | null,
    inspectedEtag: String | null,
    deletedAt: Date | null,
    __v: Number,
    createdAt: Date,
    updatedAt: Date
}
```

PENDING is an upload reservation, not a visible image. Only READY rows enter gallery queries. No approval/moderation state exists. createdAt remains the reservation time and provides stable pagination ordering.

---

# 61. Photo upload ownership

Member upload: uploaderType MEMBER and uploadedByUserId set from the authorized session. Guest upload: uploaderType GUEST, uploadedByUserId null, and galleryAccessVersion captured from the authorized gallery configuration.

A shared gallery link does not identify a particular invited Guest; do not fabricate a guestId. Confirmation rechecks current membership or gallery availability/accessVersion. Historical uploader user IDs are attribution only.

---

# 62. R2 Object Key

Store only the storage identifier:

```text
objectKey
```

Example:

```text
weddings/65abc.../photos/8d92...jpg
```

Do not persist temporary signed URLs.

Signed URLs expire and should be generated dynamically.

---

# 63. Photo indexes

```javascript
unique(objectKey)
unique(uploadKey)
index(weddingId, status, createdAt DESC, _id DESC)
index(weddingId, status, eventId, createdAt DESC, _id DESC)
index(status, finalizationLeaseExpiresAt)
```

Use a two-part createdAt/_id cursor. Do not TTL-delete PENDING or DELETED rows while they are the only metadata reference to storage objects or unfinished cleanup.

---

# 64. Photo confirmation, deletion, and recovery

Confirmation and deletion are coordinated through state and fenced writes; R2 and MongoDB do not share a transaction.

**Confirmation:** atomically claim a PENDING row using a finalizationId and bounded lease, recording a new candidate finalizationObjectKey before copying. Verify actual size, MIME/signature, and the same source ETag. Copy into that independent final key. Publish READY only with a conditional update matching status PENDING, the claim, and __v. A repeated READY confirmation returns the existing asset.

**Deletion:** atomically change PENDING/READY to DELETING and increment __v before storage deletion. This is the publication fence. Do not claim new finalizations for DELETING/DELETED rows. Wait for or resolve an existing finalization lease, delete known staging/final/candidate keys, then transition to a hidden DELETED tombstone. This prevents late confirmation from republishing the photo.

Every late finalizer must check ownership/state before publication. If it loses the fence, it removes its candidate when safe. On an ambiguous database result, first reread the authoritative row; do not delete an object that may already back a committed READY record. Provider-copy completion and database writes can fail independently, so record enough keys to recover.

Expired PUT URLs may be followed by confirmation until confirmationDeadline; the stored object still requires validation. An unexpired PUT URL can recreate staging bytes after a delete, so residual staging cleanup must account for URL expiry.

Orphan reconciliation remains a documented manual/future process. Do not claim exact atomic storage deletion or an implemented cleanup worker. The UI must distinguish hidden/deletion-pending from confirmed cleanup. No restore feature is introduced.

---

# 65. Cover Images

Wedding and Event cover images can also live in R2.

Because each entity has at most one cover image, storing:

```text
coverImageObjectKey
```

directly inside Wedding/Event is preferable to creating a Photo record.

Photo collection is reserved for gallery photos.

---

# 66. Email Jobs Collection

## Collection

```text
email_jobs
```

Used only for asynchronous bulk email.

Examples:

```text
Guest Invitations
RSVP Reminders
```

Single password resets or single member invitations do not require this collection.

---

# 67. Suggested Email Job Schema

```javascript
EmailJob {
    _id: ObjectId,

    weddingId: ObjectId,

    type:
        "GUEST_INVITATION"
        | "RSVP_REMINDER",

    guestId: ObjectId,

    recipientEmail: String,

    status:
        "PENDING"
        | "PROCESSING"
        | "SENT"
        | "FAILED"
        | "CANCELLED",

    batchId: String?,

    idempotencyKey: String,

    attempts: Number,

    nextAttemptAt: Date?,

    lockedAt: Date?,

    lockId: String?,

    sentAt: Date?,

    providerMessageId: String?,

    lastError: String?,

    createdAt: Date,
    updatedAt: Date
}
```

---

# 68. Why One Job Per Email

For 500 guests:

```text
500 EmailJob documents
```

rather than:

```text
1 giant job containing 500 recipients
```

This makes:

- Individual retries easier
- Failures isolated
- Progress measurable
- Duplicate protection easier
- Cron processing simpler

---

# 69. Email Batch ID

When Admin clicks:

```text
Send Invitations to 500 Guests
```

generate:

```text
batchId
```

and attach it to all 500 jobs.

We do not need a separate `email_batches` domain collection initially. The supporting `email_batch_requests` ledger in §117 preserves request replay and fixed recipient selection; per-job rows still determine delivery progress.

Progress can be determined through:

```text
COUNT jobs WHERE batchId = X
GROUP BY status
```

---

# 70. Email idempotency and current-data checks

Every job has a unique idempotencyKey derived from weddingId, guestId, email type, and a stable campaign/request identifier. A deliberate resend uses a new identifier. Retries reuse the same identifier; a bulk insertion retry fills missing jobs without duplicating existing ones.

Before sending, confirm guest existence, current email equals recipientEmail, and the wedding remains available. Cancel a reminder if RSVP is no longer PENDING. Never redirect a queued message silently to a changed address.

Load invitationToken only while rendering the email; never persist the secret URL or rendered HTML in the job. Provider acceptance is not proof of inbox delivery. Provider idempotency reduces duplicates, but a crash after sending and before recording success can otherwise result in a duplicate.

---

# 71. Email Job Indexes

Critical indexes:

```javascript
unique(idempotencyKey)

index(status, nextAttemptAt, createdAt)

index(weddingId, status)

index(batchId)

index(guestId)
```

The first query performed by a worker will commonly be:

```text
status = PENDING
AND
nextAttemptAt <= now
```

---

# 72. Atomic email-job claiming

Claim only PENDING jobs whose nextAttemptAt is due. Use findOneAndUpdate to set PROCESSING, lockedAt, and a unique lockId while incrementing attempts.

Every success, failure, retry, and cancellation update must match the current lockId and PROCESSING status. A stale worker whose lease has been replaced cannot overwrite the new owner's result.

Provider calls remain outside transactions. The claim lease must cover the bounded request duration, with renewal if needed. Retry uses PENDING plus a future nextAttemptAt; no additional RETRY status is required.

---

# 73. Recovering stuck jobs

Reclaim PROCESSING jobs only after the configured lock timeout by conditionally matching their current lockId/lockedAt. Reset them to PENDING with a retry time and clear ownership, or mark FAILED if the attempt limit is reached.

A new worker uses a fresh lockId. A late old worker must fail its fenced database updates. A provider call already in flight may still complete; use provider idempotency and never promise exactly-once delivery.

---

# 74. Retry policy and scheduler limits

Configure attempt count, lock lifetime, and backoff; for example, retry eligibility after 5 then 30 minutes. nextAttemptAt is the earliest eligibility time, not a guarantee of execution then.

Vercel Cron's selected plan determines actual polling frequency. The architecture's free-tier daily-cron limitation still applies. Do not imply minute-level bulk retries on a plan that cannot invoke the processor that frequently.

---

# 75. Email Job Cleanup

Sent jobs do not need to remain forever.

A later cleanup strategy may delete:

```text
SENT / FAILED email jobs
older than 30–90 days
```

This is not required for initial launch but prevents endless growth.

---

# 76. No Separate RSVP Collection

V1 has exactly one current RSVP per Guest.

Therefore:

```text
Guest {
    rsvpStatus,
    attendingCount,
    rsvpUpdatedAt
}
```

is sufficient.

A separate RSVP collection would only be needed if we later require:

- RSVP history
- Per-person responses
- Per-event responses
- Audit trails

---

# 77. No Separate Website Collection

There is exactly one website configuration per Wedding.

Therefore embedding website config inside Wedding is preferable.

---

# 78. No Separate Gallery Collection

There is exactly one gallery per Wedding.

Gallery configuration belongs inside Wedding.

Photos remain separate because they are unbounded.

---

# 79. No Separate Livestream Collection

There is one current livestream configuration.

Embed inside Wedding.

---

# 80. Relationship summary

| Parent | Child/reference | Relationship |
|---|---|---|
| User | Sessions / reset tokens | 1:N |
| User | Current WeddingMembership | 0:1 in V1 |
| Wedding | Memberships / member invitations | 1:N |
| Wedding | Events / tasks / guests / vendors / expenses / photos / email jobs | 1:N |
| Event | Guests | N:N through Guest.invitedEventIds |
| Event | Vendors | N:N through Vendor.eventIds |
| Event | Tasks / expenses / photos | Optional 1:N |
| Vendor | Expenses | Optional 1:N |
| Membership | Assigned tasks | Optional 1:N |
| User | Created expenses / uploaded photos | Historical attribution |

Small website/gallery/livestream/location settings are embedded, not separate collections.

---

# 81. Tenant Isolation Rule

This is the most important database-access rule.

Bad:

```javascript
Task.findById(taskId)
```

Preferred:

```javascript
Task.findOne({
    _id: taskId,
    weddingId: currentWeddingId
})
```

Apply the same pattern to:

```text
Events
Guests
Vendors
Expenses
Photos
```

The client should never decide which Wedding it is authorized to access.

---

# 82. Do Not Trust weddingId from the Client

An authenticated request might send:

```json
{
    "weddingId": "another-wedding-id"
}
```

The backend should ignore this for authorization.

Instead:

```text
Session
   ↓
User
   ↓
WeddingMembership
   ↓
currentWeddingId
```

The backend derives tenant context itself.

---

# 83. Cross-entity validation and concurrent changes

Every reference assignment validates both ID and weddingId and rejects newly selected archived events/vendors. Existing historical references remain readable.

To prevent assignment racing archive, participating relationship writes and archive operations increment Wedding.referenceRevision inside a short transaction before checking targets. At V1 scale this is a simple per-wedding conflict point; ordinary title/status changes need not acquire it.

Task assignments also participate in the membershipRevision protocol. Where both fences are needed, always acquire membershipRevision before referenceRevision. Retry transaction conflicts with bounded retries. MongoDB references alone do not enforce ownership or active state.

---

# 84. Transactions

MongoDB transactions should be used selectively.

Do not wrap every API call in a transaction.

Use transactions when several changes together represent one business operation.

---

# 85. Create Wedding Transaction

Operation:

```text
Create Wedding
+
Create Initial ADMIN Membership
```

Both should succeed together.

If Membership creation fails, the system should not leave an inaccessible Wedding behind.

---

# 86. Accept Member Invitation Transaction

Operation:

```text
Validate Invitation

Create WeddingMembership

Mark Invitation ACCEPTED
```

These should be atomic.

This also protects against two concurrent attempts to accept the same invitation.

---

# 87. Bulk Email Job Creation

Creating hundreds of email jobs does not necessarily require one giant MongoDB transaction.

Use:

```text
insertMany
```

with appropriate uniqueness/idempotency guarantees.

Large transactions should be avoided when they provide little business value.

---

# 88. Dashboard Queries

The dashboard can initially calculate values from primary collections.

Examples:

### Events

```text
count events
WHERE weddingId
AND archivedAt = null
```

### Tasks

```text
count all tasks
count completed tasks
```

### Guests

```text
count guests

count WHERE
rsvpStatus = ATTENDING
```

### Expenses

```text
SUM amountPaise
WHERE weddingId
```

### Vendors

```text
count vendors
WHERE archivedAt = null
```

This scale is completely reasonable for V1.

---

# 89. No Summary Counters Initially

Avoid fields such as:

```text
Wedding.totalGuestCount
Wedding.totalExpenses
Wedding.completedTasks
Wedding.photoCount
```

because every write then requires keeping derived data synchronized.

If dashboard queries later become expensive, selective denormalized counters can be introduced.

---

# 90. Pagination Strategy

Collections requiring pagination:

```text
Guests
Photos
Tasks
Expenses
Vendors
```

Guests are limited enough that ordinary pagination is acceptable.

Photos may reach several thousand per Wedding, so cursor-style pagination based on:

```text
createdAt
_id
```

is preferable for the gallery.

Exact API pagination design will be defined later.

---

# 91. Consolidated index inventory

All collections retain MongoDB's default unique _id index. Suggested initial indexes:

| Collection | Indexes |
|---|---|
| users | emailNormalized UNIQUE |
| sessions | tokenHash UNIQUE; userId; expiresAt TTL |
| password_reset_tokens | tokenHash UNIQUE; userId; expiresAt TTL |
| weddings | website.slug UNIQUE; gallery.tokenHash UNIQUE |
| wedding_memberships | userId UNIQUE; weddingId + role |
| wedding_member_invitations | tokenHash UNIQUE; weddingId + status; emailNormalized; expiresAt; weddingId + emailNormalized UNIQUE where status=PENDING |
| events | weddingId + startsAt; weddingId + archivedAt |
| tasks | weddingId + status; weddingId + dueDate; weddingId + assignedMembershipId + status; weddingId + eventId |
| guests | invitationToken UNIQUE; weddingId + rsvpStatus; weddingId + name; weddingId + emailNormalized; weddingId + invitedEventIds |
| vendors | weddingId + category; weddingId + archivedAt; weddingId + googlePlaceId |
| expenses | weddingId + expenseDate; weddingId + category; weddingId + vendorId; weddingId + eventId |
| photos | objectKey UNIQUE; uploadKey UNIQUE; weddingId + status + createdAt DESC + _id DESC; weddingId + status + eventId + createdAt DESC + _id DESC; status + finalizationLeaseExpiresAt |
| email_jobs | idempotencyKey UNIQUE; status + nextAttemptAt + createdAt; status + lockedAt; weddingId + status; batchId; guestId |
| rate_limit_buckets | _id UNIQUE by default; expiresAt TTL |
| email_batch_requests | weddingId + keyHash UNIQUE; batchId UNIQUE for non-null values; retention policy per §117 |

These are candidates tied to expected access patterns. Confirm query plans and avoid redundant indexes. Guest email is not unique. Optional vendor place-ID uniqueness, if selected, needs a partial filter for actual string-valued IDs and a decision on reusing archived vendors.

TTL indexes use expireAfterSeconds:0 on absolute expiry dates. Expiry is enforced immediately by application predicates; asynchronous TTL deletion is cleanup only.

---

# 92. Deletion strategy

| Entity | Strategy |
|---|---|
| User | No user deletion in V1 |
| Session/reset token | Hard delete / TTL; validate expiry before cleanup |
| Wedding | Soft delete; all private/public/guest access checks deletedAt |
| Membership | Clear active assignments, then hard delete; historical User IDs retained |
| Member invitation | Status-based retention; revoke on wedding deletion |
| Event | Archive, retain historical references; hide from all guest itineraries |
| Task | Hard delete |
| Guest | Hard delete and cancel pending jobs; old links fail |
| Vendor | Archive; expenses retain references |
| Expense | Hard delete |
| Photo | DELETING fence, R2 cleanup, hidden DELETED tombstone |
| Email job | Status plus configured eventual cleanup |
| Rate bucket | TTL after window cleanup margin |
| Email batch request | Retain through job retention and replay horizon; never remove unfinished recovery state (§117) |

Wedding soft deletion is a persistence capability, not an added user-facing deletion permission. Any destructive whole-wedding endpoint requires a separate explicit product/API decision.

---

# 93. Why Wedding Uses Soft Delete

Deleting an entire Wedding could remove:

- Events
- Guests
- Expenses
- Thousands of photos
- Invitations
- Vendors

Accidental deletion would be catastrophic.

Therefore:

```javascript
deletedAt
```

is safer.

Actual permanent deletion can later become a separate administrative workflow.

---

# 94. Why Events Are Archived

Events have many incoming references.

Archiving avoids complicated cascades.

Example:

```text
Wedding event cancelled
     ↓
archive Event
```

Existing:

- Expenses
- Tasks
- Photo associations

remain historically understandable.

---

# 95. Why Vendors Are Archived

Expenses may reference Vendors.

If a vendor is removed from active planning, historical expense information should continue making sense.

---

# 96. Data Validation Layers

We will intentionally have two layers.

## Zod

Validates external application input.

Example:

```text
amount > 0
valid email
allowed task status
attendingCount <= maxGuests
```

## Mongoose

Protects database structure.

Example:

```text
required fields
enum values
basic number constraints
indexes
```

Business rules still belong primarily in services.

---

# 97. Enum Storage

Enums should be stored as readable strings.

Prefer:

```text
"IN_PROGRESS"
```

over:

```text
2
```

Reasons:

- Easier debugging
- Easier database inspection
- Safer future evolution
- More understandable logs

---

# 98. Token storage rules

| Token | Database representation | Retrieval |
|---|---|---|
| Session | Purpose-separated HMAC tokenHash | Raw token only in browser cookie |
| Password reset | Purpose-separated HMAC tokenHash | Single-use link issued on request |
| Member invitation | Purpose-separated HMAC tokenHash | Reissue rotates token |
| Guest invitation | Raw random invitationToken, excluded by default | Deliberate stable-sharing exception; authorized sharing only |
| Gallery | tokenHash plus authenticated-encrypted tokenCiphertext and key ID | Decrypt for authorized stable link/QR retrieval |

The general hash-only rule does not apply to the two retrievable sharing capabilities. Never log any raw token or signed media URL. Protect database backups and encryption/HMAC keys separately. Key rotation for lookup digests must be explicitly planned; encryption rotation can preserve the raw gallery token.

---

# 99. Token Generation

Use cryptographically secure random generation.

Conceptually:

```javascript
crypto.randomBytes(...)
```

Do not use:

```javascript
Math.random()
```

for security-sensitive tokens.

---

# 100. Public Identifiers

Different resource types use different public identifiers.

```text
Wedding Website
→ slug

Guest Invitation
→ secret token

Gallery / QR
→ secret token

Internal Authenticated Entities
→ Mongo ObjectId
```

Authenticated ObjectIds are acceptable as long as authorization checks always include `weddingId`.

---

# 101. Photo Storage Responsibility

MongoDB owns:

```text
metadata
ownership
event relationship
timestamps
```

Cloudflare R2 owns:

```text
binary file
```

MongoDB should never contain Base64 wedding images or large photo binaries.

---

# 102. Storage Key Structure

Recommended object hierarchy:

```text
weddings/
   {weddingId}/
      covers/
      events/
      gallery/
```

Gallery example:

```text
weddings/{weddingId}/gallery/{randomFileId}.jpg
```

Do not rely on filenames supplied by guests as object identifiers.

---

# 103. Security Against Cross-Wedding File Upload

When generating an R2 upload URL:

```text
Authenticated Member
      ↓
derive weddingId from Membership
```

or:

```text
Guest Gallery Token
      ↓
derive weddingId from token
```

The client never arbitrarily chooses:

```text
/weddings/{someOtherWeddingId}
```

---

# 104. Guest Email Is Optional

A Guest can exist with:

```text
name
phone
```

without email.

The organiser can manually share their invitation through WhatsApp.

Therefore:

```text
email
```

is optional.

However:

```text
Send Email Invitation
```

requires Guest.email.

---

# 105. Phone Numbers

Phone numbers should initially be stored as strings.

Do not store as numeric values because:

- `+` is meaningful
- Leading zeros can matter
- Numeric arithmetic is irrelevant

Example:

```text
+919876543210
```

Normalization rules can be improved when WhatsApp/SMS integrations are introduced.

---

# 106. Data Ownership Summary

### User-owned

```text
Sessions
Password Reset Tokens
```

### Wedding-owned

```text
Memberships
Member Invitations
Events
Tasks
Guests
Vendors
Expenses
Photos
Email Jobs
```

### Embedded Wedding configuration

```text
Location
Website
Gallery
Livestream
```

---

# 107. Estimated Document Volumes

Approximate intended upper bounds per Wedding:

```text
Memberships
~5–20

Events
~5–20

Tasks
~50–500

Guests
~100–1,000

Vendors
~10–100

Expenses
~50–1,000

Photos
~0–5,000+

Email Jobs
potentially thousands over wedding lifecycle
```

These volumes strongly support separate collections for growing entities.

---

# 108. MongoDB Document Size

MongoDB's individual-document size limit should never become relevant with this design.

We deliberately avoid embedding:

```text
thousands of guests
thousands of photos
unbounded expense arrays
```

inside Wedding.

---

# 109. Referential Integrity Philosophy

Because MongoDB does not provide relational foreign keys:

> Every write involving references must be treated as a business operation rather than simply storing IDs received from the frontend.

Example:

```text
Create Expense

1. Authenticate
2. Determine Wedding
3. Validate Event belongs to Wedding
4. Validate Vendor belongs to Wedding
5. Validate Membership belongs to Wedding
6. Create Expense
```

This pattern is fundamental to the application.

---

# 110. Data Model Summary

The final V1 model is:

```text
User
├── Sessions
├── PasswordResetTokens
└── WeddingMembership
         │
         ▼
      Wedding
         │
         ├── Location
         ├── Website
         ├── Gallery
         ├── Livestream
         │
         ├── WeddingMemberInvitations
         ├── Events
         ├── Tasks
         ├── Guests
         │      ├── Invitation Token
         │      ├── Invited Events
         │      └── RSVP
         │
         ├── Vendors
         ├── Expenses
         ├── Photos → Cloudflare R2
         └── EmailJobs
```

---

# 111. Key database decisions

1. Wedding is the private-data boundary.
2. Growing entities use separate collections; small 1:1 settings are embedded.
3. One guest owns one stable invitation and one RSVP/headcount.
4. Event references are bounded arrays; no event-RSVP join collection.
5. Membership owns current role; User IDs preserve historical attribution.
6. Money uses validated integer paise; date-only fields use YYYY-MM-DD.
7. Sessions/reset/member tokens are hashed; guest sharing uses a restricted retrievable token; gallery sharing uses encrypted retrieval plus hash lookup.
8. Events/vendors are archived, preserving historical links.
9. Photo metadata includes a recoverable lifecycle and deletion fence; files remain in R2.
10. MongoDB stores bulk email jobs and supporting rate counters.
11. Dashboard totals are computed, not duplicated counters.
12. Transactions and shared conflict points protect membership and relationship invariants.

---

# 112. Final collection list

**13 primary collections:**

```text
users
sessions
password_reset_tokens
weddings
wedding_memberships
wedding_member_invitations
events
tasks
guests
vendors
expenses
photos
email_jobs
```

**Two supporting infrastructure collections:**

```text
rate_limit_buckets
```

The second supporting collection is `email_batch_requests` (§117). Total: 15 physical collections in this design. Cover-operation markers (§118) are embedded on Wedding/Event, not a separate collection. There is no separate website, gallery, livestream, guest-invitation, RSVP, household, or budget collection.

---

# 113. Next step and implementation parameters

API_DESIGN.md defines the aligned HTTP contracts. Implement the persistence requirements, including §§117–118, through reviewed schemas and migrations before the corresponding features.

Before deployment, configure session/reset/invitation lifetimes, batch and retry limits, terminal-job retention, image size and allowed formats, wedding upload quotas, and maximum input lengths/headcounts.

The system architecture's storage-quota requirement remains operational work: do not infer a strict aggregate quota can be enforced safely by a count-then-upload query. If hard concurrent quota enforcement is required, add atomic admission accounting through a reviewed migration. No such counter is silently introduced into this simpler baseline.

No database has been provisioned, source file modified, or migration executed by producing this document.

---


---

# 114. Supporting Rate-Limit Collection

Collection: `rate_limit_buckets`. This is infrastructure, not an additional wedding domain entity.

```javascript
RateLimitBucket {
    _id: String, // HMAC of policy + scope + windowStart.
    policy: String,
    windowStart: Date,
    count: Number,
    expiresAt: Date
}
```

Use `_id` uniqueness and an absolute-expiry TTL index. Store no raw guest token or raw IP address when an HMAC-derived scope is sufficient.

Initialize a window bucket safely, then admit requests using an atomic increment conditioned on count being below the configured limit. A full bucket must reject admission, not trigger an upsert that recreates capacity. New time windows have new IDs, so TTL cleanup delays do not change limit semantics.

Policies cover login, signup, password reset, public RSVP, upload authorization, email submission, and discovery. Keep thresholds in server configuration. Per-invitation admission precedes the shared valid-RSVP quota; separate request/IP controls protect invalid-token traffic.

---

# 115. Transaction and Recovery Checklist

| Workflow | Database coordination |
|---|---|
| Create wedding | Wedding + initial Admin membership transaction; userId unique constraint |
| Accept member invitation | Validate token/expiry/email, create membership, consume invitation atomically |
| Remove/demote Admin | membershipRevision fence, recheck actor, enforce at least one Admin |
| Remove member | Same fence; clear assigned tasks before deleting membership |
| Assign task | Membership fence for assignee; reference fence for event |
| Archive event/vendor | referenceRevision fence; retain existing historical references |
| RSVP | Atomic __v/capacity-checked Guest update |
| Password reset | Token claim + password update + credentialVersion increment transaction |
| Delete guest | Delete Guest and cancel pending email jobs; in-flight provider calls remain an external limitation |
| Confirm photo | Storage validation/copy outside transaction; fenced PENDING-to-READY write |
| Delete photo | DELETING publication fence before storage calls; tombstone retained |
| Bulk email | Unique request keys, leased claims, fenced completion updates |

Keep external calls outside database transactions. Retry transient transaction conflicts with bounded retries. Every retry must be safe to repeat; email sending and R2 copying are not magically rolled back by MongoDB.

MongoDB guarantees single-document write atomicity. Multi-document transactions coordinate related writes, while shared write fences prevent the relevant concurrent operations from acting on incompatible snapshots. See [MongoDB atomicity and transactions](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/).

---

# 116. Validation, Migration, and Verification

## Validation

- Validate maxGuests and attendingCount as integers, with PENDING=null and declined=0.
- Validate money as safe integer paise, with explicit upper bounds; reject fractional paise.
- Validate date-only strings as real calendar dates, not just matching text patterns.
- Validate endsAt after startsAt and the wedding's IANA timeZone.
- Bound text lengths, event arrays, page sizes, and accepted upload metadata.
- Derive actor IDs, tenant IDs, token fields, lock IDs, and versions on the server.
- Public projection allowlists exclude secret fields, internal notes, and unrelated event/guest data.

## Migrations

Use reviewed versioned migrations for indexes and schema changes. Avoid automatic destructive production index synchronization. Resolve duplicates before adding unique constraints. No migration is executed by this document.

The earlier assistant draft is superseded; do not automatically migrate a database based on it. If per-event RSVP records already exist, converting them to one response requires an explicit mapping decision because differing responses cannot be collapsed losslessly.

Do not TTL-delete photo lifecycle rows while physical objects or ambiguous operations remain. TTL cleanup is asynchronous and does not replace request-time expiry checks. See [MongoDB TTL behavior](https://www.mongodb.com/docs/manual/core/index-ttl/).

## Required verification

1. Concurrent wedding creation or invitation acceptance cannot give one user two memberships.
2. Parallel Admin changes cannot remove the final Admin.
3. Member removal racing assignment cannot leave an invalid active task assignment.
4. Event/vendor archival racing a new reference cannot introduce an impermissible assignment.
5. Guest RSVP racing a capacity change preserves the complete status/count invariant.
6. Token hashes and encrypted gallery retrieval work without leaking secrets through projections or logs.
7. Reissuing an expired PENDING member invitation does not violate the partial unique index.
8. Photo deletion racing confirmation cannot republish a deleted image.
9. Ambiguous photo commits do not cause deletion of a committed READY object's bytes.
10. Stale email workers cannot overwrite results owned by a new lockId.
11. Guest deletion/RSVP changes cancel jobs that are no longer valid before provider submission.
12. Public website and invitation views exclude archived/private events as required.
13. Archived vendors and events remain understandable on historical organizer records.
14. Password reset invalidates earlier sessions before TTL cleanup.
15. Cross-wedding reads, mutations, references, and aggregation joins are rejected.

Test transactions on a replica-set environment. Use isolated test data and storage prefixes; production guest links and R2 files are not test fixtures. Confirm backup and restore coverage for MongoDB records, R2 objects, and separately managed encryption/HMAC keys before real usage.

---

# 117. Supporting Email Batch Request Ledger

Collection: `email_batch_requests`. This supporting infrastructure collection makes bulk-request replay durable; it is not a separate wedding domain entity.

Persist weddingId, keyHash (the hashed client Idempotency-Key), requestFingerprint (normalized operation and input), batchId, a bounded immutable selection/eligibility snapshot, creationStatus, createdAt, updatedAt, and expiresAt. The snapshot records selected guest IDs, enqueue-time recipient addresses where eligible, stable job keys, and skip reasons sufficient to reproduce the original counts. Bound the snapshot to the supported campaign size (initially at most 1,000 invitations). Never store invitation tokens, rendered email HTML, or secret sharing URLs.

Use unique(weddingId, keyHash) to establish request ownership and unique(batchId) for non-null batch IDs through a partial index. Scope every lookup to weddingId. creationStatus distinguishes MATERIALIZING from COMPLETE; COMPLETE means job materialization is finished, not email delivery. Persist a completed zero-eligible result with batchId null so a retry does not silently select new recipients.

Create the request snapshot before materializing jobs. Replays with the same fingerprint resume the same snapshot and insert only missing jobs using email_jobs.idempotencyKey uniqueness. A different fingerprint under the same key returns conflict. Status polling may resume interrupted materialization. Job insertion must preserve the saved recipient rather than redirect to changed contact details; workers still recheck current guest, wedding, email, and reminder eligibility before sending.

Retention must cover associated jobs and the supported replay/retry horizon. Do not expire an unfinished request or a ledger still needed by retained jobs. Add a cleanup/TTL policy only when those retention conditions are enforced; expiresAt alone must not delete recovery state prematurely. The index and deletion inventories include this ledger; create it through a reviewed migration when implementing the feature. No collection or migration has been executed by this specification.

# 118. Embedded Cover Operation Markers

Wedding and Event retain coverImageObjectKey and additionally own bounded cover-operation state. This is not a Photo record or an unbounded operation history.

- pendingCover: operation ID, authorized actor User ID, purpose/target binding, grant version, server-selected staging key, expected filename/MIME/size, expiry, candidate final key, and finalization claim/lease where needed. Store server-controlled grant identity, not a raw bearer upload token.
- lastConfirmedCover: operation ID, final object key, and resulting version sufficient to recognize a completed retry without repeating the copy or replacing newer content. A stale completed retry must not alter the current cover.
- coverCleanup: bounded cleanup state identifying the operation and known superseded/staging/candidate keys still requiring deletion. Retain ambiguous operations until reconciled; reject further grants with a retryable conflict if admitting them would exceed the bound or overwrite unresolved recovery state.

Issuing a grant advances the target version and records its identity. Confirmation matches the current grant, actor, target, expiry, and version, verifies stored bytes, and conditionally copies the inspected object to an independent final key. Publish the cover and completed-operation marker through a fenced update. Never expose markers in ordinary API responses. Replaced grants cannot publish; retries must not delete or overwrite a newer cover.

Perform external storage calls outside database transactions. On ambiguous outcomes, reread authoritative state before cleanup. Deletion clears the reference with a version/operation fence and records pending cleanup, returning the API's pending/completed outcome truthfully. Unexpired upload URLs may recreate staging objects; retain recovery information and account for URL expiry during manual cleanup. Exact embedded field layout and bounded limits are implementation details to verify with race/retry tests before real uploads.

# 119. Cross-document Alignment (15 November 2026)

The PRD owns product behavior and scope, System Design owns architecture and service boundaries, Database Design owns persistence and invariants, and API Design owns HTTP contracts. Reconcile contradictions explicitly rather than selecting a document by date alone.

Archived events and vendors are read-only; restoration is outside V1. Dashboard and RSVP eventAttendance totals are derived per active event from ATTENDING invitations referencing that event; pending/null and declined/zero contribute zero. Include zero-attendance active events and never sum event totals into the wedding-wide total. No persisted summary counters are added.

Task dueDateFrom/dueDateTo filters use inclusive calendar-date bounds and omit undated tasks when either bound is present. No date conversion or new field is required. Initial media formats, selection limits, and signed URL lifetimes follow API Design §16 and PRD §13.2; aggregate quotas and production throughput remain release decisions.