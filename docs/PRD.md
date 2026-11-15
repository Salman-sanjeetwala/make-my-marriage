# Make My Marriage — Product Requirements Document

**Version:** 1.2  
**Date:** 15 November 2026  
**Release:** V1  
**Project type:** Portfolio web application  
**Development team:** Solo developer

## 1. Product overview

Make My Marriage helps a couple and their family plan an Indian wedding in a shared workspace. Organizers can coordinate events and tasks, invite guests, track RSVP headcounts, find and manage vendors, record expenses, publish a themed wedding website, share a YouTube livestream, and collect photos in a private gallery.

Admins and Managers use accounts. Guests open private invitation and gallery links without signing up. A published wedding website has a stable address such as `makemymarriage.com/w/rohan-priya-14022027`. V1 is free to use.

This revision aligns V1 with `SYSTEM_DESIGN.md`, `DATABASE_DESIGN.md`, and `API_DESIGN.md`. The PRD owns product behavior and scope; the system design owns architecture and service boundaries; the database design owns persistence and invariants; the API design owns HTTP contracts. Conflicts must be explicitly reconciled across the affected documents rather than resolved by publication date alone. Section 13 records alignment decisions and remaining release parameters.

## 2. Problem statement

An Indian wedding involves multiple events, organizers, vendors, and guest groups. Information spread across messages, spreadsheets, calls, and photo folders makes it difficult to keep the plan current. Organizers need one place to coordinate the work, and guests need a simple way to confirm their party size, find event details, and share photos.

## 3. Product goals

- Give the couple and family organizers a shared schedule and a clear view of tasks and responsibilities.
- Let guests respond once for their party and help organizers estimate attendance at each invited event.
- Keep vendor arrangements and recorded expenses easy to find.
- Let organizers publish a responsive wedding website and share a configured YouTube livestream.
- Let guests share and view photos through a private link without an account.

## 4. Users and permissions

| User | Capabilities |
|---|---|
| **Admin** | Manage wedding settings, events, tasks, guests, invitations, vendors, expenses, website publication, gallery, and livestream. Invite or remove members and change roles. |
| **Manager** | Manage wedding settings and day-to-day planning, including expenses, website publication, gallery, and livestream. Membership administration is reserved for Admins. |
| **Invited guest** | View the itinerary for their invitation and submit or revise one RSVP and headcount. |
| **Gallery link holder** | View and download gallery photos while the gallery is enabled. Upload photos when guest uploads are enabled. |
| **Public visitor** | View the published wedding website and its public content, including the livestream when enabled. |

Roles belong to the current wedding membership. A registered user may belong to at most one wedding at a time, and a wedding may have multiple Admins. Each operation checks the current membership or the specific guest link. The wedding is the boundary for private records.

## 5. Core user journeys

### 5.1 Create and organize a wedding

1. An organizer signs up and creates a wedding, becoming its first Admin.
2. They invite their partner as an Admin and family organizers as Managers.
3. Each invitee opens the email link, signs up or signs in with the invited address, and accepts.
4. The team adds events, assigns tasks, and uses the dashboard to review progress.

### 5.2 Invite guests and collect responses

1. An organizer creates one invitation for a named contact, sets the maximum party size, and selects the invited events.
2. The organizer copies the private link or emails it to the contact. Bulk email is queued.
3. The guest opens the link, sees the active events on their itinerary, and responds once for their whole party.
4. The organizer sees the invitation status and attending headcount. Each event estimate uses that saved response for invitations that include the event.
5. The organizer records replies received offline or sends reminders to invitations that are still pending.

### 5.3 Find vendors and record expenses

1. An organizer finds a vendor through Google Places or enters one manually.
2. They save the vendor in My Vendors, link the relevant events, and record the agreed cost and coordination notes.
3. They create expense records for spent or committed amounts and review the recorded INR totals.

### 5.4 Publish the website and livestream

1. An Admin or Manager chooses a theme, edits the welcome content, and marks selected events public.
2. They preview and publish the website at its assigned URL.
3. They can enable one wedding-wide YouTube livestream. Visitors can use a viewing link when the embed is unavailable.

### 5.5 Collect and share wedding photos

1. An organizer enables the private gallery and shares its link or QR code. They enable guest uploads when ready to collect photos.
2. A guest opens the gallery on a phone and uploads photos without an account.
3. Confirmed photos become available in the private gallery after technical validation.
4. An organizer can remove photos and disable guest uploads or gallery access. Emergency rotation of a leaked gallery link is performed through an operational recovery procedure; organizer self-service rotation is outside V1.

## 6. Functional requirements

### 6.1 Accounts and wedding membership

- Support signup with name, email, and password, as well as login, logout, and password reset. Signup activates the account immediately. Email verification is outside V1.
- Establish a server-side session after signup or login. Logout invalidates the session. Password reset uses a short-lived, single-use emailed link and invalidates older sessions.
- Create the wedding and its first Admin membership together. During onboarding, give a pending membership invitation precedence over wedding creation.
- Let Admins list members, invite by email with an assigned role, change roles, and remove members. Acceptance requires an unexpired invitation secret and authentication as the intended email address. Accept the invitation once and reject users who already belong to a wedding. Reissuing an invitation invalidates the previous link.
- Preserve at least one Admin even when role changes or removals happen concurrently. Removal ends access on subsequent requests and clears active task assignments while preserving task records and historical attribution.

### 6.2 Wedding setup and dashboard

- Capture the couple's names, wedding date, timezone, and structured location. Support an optional title, description, and cover image. Use `Asia/Kolkata` as the initial timezone for Indian weddings.
- Keep the wedding date as a calendar date. Display event times and interpret date-only task and expense fields in the wedding calendar.
- Show the countdown, upcoming active events, task progress and overdue work, invitation counts by RSVP status, attending headcount, per-event attendance estimates, active vendor count, and total recorded expenses.
- Derive dashboard values from the underlying records. Label invitation counts and people counts separately. Keep the wedding-wide headcount separate from the sum of event estimates, since a party can attend several events.

### 6.3 Events

- Create and edit events with a free-form name, optional type, start time, optional end time, venue, address, description, dress code, and optional cover image. Support common Indian wedding event types and custom events. Show events chronologically with map directions where venue information supports them.
- Allow active events to be linked to tasks, guest invitations, vendors, expenses, and photos. Events are private by default. An organizer can explicitly make an active event public. Private invitations may show their own active invited events regardless of public visibility.
- Confirm archival and explain its effect. Archived events disappear from active lists, the public website, and existing invitation itineraries. Historical organizer records retain their references and show that the event is archived. Archived events are unavailable for new associations. Related photos remain accessible through the private gallery, and existing RSVPs are preserved.

### 6.4 Tasks

- Create, edit, delete, and filter wedding-wide or event-specific tasks. Store a title, optional description, optional assignee and due date, priority, and status.
- Support **To do**, **In progress**, and **Completed**, with **Low**, **Medium**, and **High** priorities. Identify overdue incomplete tasks and filter by assignee, event, status, and inclusive due-date range in the wedding calendar.
- Assign tasks to active members of the current wedding. If a member is removed, retain the task and mark it unassigned.

### 6.5 Guest records and RSVP

- A guest record represents one invitation to a named contact. Store optional email, phone, internal notes, a positive maximum party size, and a bounded set of invited events from the same wedding. Several invitations may use the same email address.
- Generate one stable, private invitation link at `/invite/{token}`. Organizers can copy it to share outside the product. Guests see their own invitation, their permitted active events, and the RSVP form. Removing the guest invalidates the link and cancels pending email jobs for that record.
- Save one status and one attending count per invitation. The response applies to every active invited event. The count includes the named guest. A maximum of four allows four people total.

| RSVP status | Attending count | Meaning |
|---|---|---|
| **Pending** | Unset | No response yet. |
| **Attending** | Whole number from 1 through the current maximum | Total people attending, including the named guest. |
| **Not attending** | 0 | Invitation declined. |

- Let guests revise their response through the same valid link and organizers record responses received offline. Repeated identical submissions return the saved result. If an organizer changes invitation details or capacity while a guest is responding, reject conflicting stale updates and show the current state. A capacity reduction below a saved headcount requires an explicit valid revision.
- When an invitation has zero active events, retain its saved response in the workspace and disable public RSVP submission until an active event is assigned.
- Calculate each event estimate from the saved attending headcounts of invitations that include the active event. A pending or declined invitation contributes zero attendees.

### 6.6 Email invitations and reminders

- Send member invitations, password resets, guest invitations, and organizer-triggered RSVP reminders through Resend. Require a guest email address for email actions. Manual sharing works without an email address.
- Give individual sends an accepted or failed result and a controlled retry. Queue bulk guest invitations and reminders and show their progress. Track queued, processing, sent, failed, and cancelled outcomes separately from the RSVP. **Sent** means the provider accepted the message. Inbox delivery remains unconfirmed.
- Recheck the wedding, guest record, and current recipient before sending a queued message. A changed recipient or unavailable invitation cancels the queued send. Send RSVP reminders only while the invitation is pending, including a recheck immediately before delivery. Use repeat-safe job submission and bounded retries.
- Explain bulk delays using the production scheduler cadence. A free-tier demo should show bulk messages as queued or delayed. Individual sends follow the separate immediate path.

### 6.7 Vendor discovery

- Let organizers search Google Places by category, text query, or both; require at least one. Use the wedding coordinates by default and allow a coordinate override. If neither provides usable coordinates, request a location before searching.
- Show available results with required attribution and let organizers add a result to My Vendors. Retain the permitted place ID and organizer-entered details. Follow provider rules for displaying, refreshing, and storing provider content.
- Show a clear failure state when discovery is unavailable. Existing vendor records and manual entry remain usable.

### 6.8 My Vendors

- Create or edit wedding-owned vendors manually or from discovery. Store name, category, optional contact details, optional total agreed cost in INR, coordination notes, and links to zero or more events. Vendors can be saved before events are assigned.
- Record one agreed cost for the vendor across its linked events. Organizers make arrangements externally. Shortlisted or booked states per event are outside V1.
- Archive vendors to remove them from active planning and new assignments. Existing expenses retain their historical vendor references. Archived events and vendors are read-only; restoration is deferred beyond V1.

### 6.9 Expense tracking

- Add, edit, and delete expense records for amounts spent or committed. Capture a title, positive INR amount, expense date, category, optional notes, and optional event or vendor links.
- Use integer paise for calculations and display amounts in rupees. Show the total recorded amount and totals by category. Label totals as recorded expenses so they are understood to include commitments.
- Include only explicit expense records in totals. Vendor agreed costs are reference amounts and create zero expense entries automatically. Historical links to archived events and vendors remain readable.

### 6.10 Wedding website

- Provide a public route at `/w/{slug}`. Generate a unique slug from the couple's names and wedding date, adding a suffix for collisions. Keep the URL stable through edits to names, dates, content, and themes.
- Offer two to three responsive themes over the same content. Allow organizers to edit welcome text and cover content, preview the site, publish it, and unpublish it. Admins and Managers can publish.
- Show the deliberately published couple details, cover, welcome text, active public events, and an enabled livestream. Use active event records for the public schedule.
- Keep private events, guest contacts, organizer notes, tasks, expenses, and private links out of public responses. Share invitation and gallery links directly with guests. Any public gallery description must keep the private URL and QR code undisclosed.

### 6.11 Private gallery

- Provide one private gallery per wedding. Admins and Managers can upload, browse, view full-screen, download individual originals, and remove photos. Support optional event association.
- Generate a stable private gallery URL at `/gallery/{token}` and a matching QR code. Enable gallery access and guest uploads separately. When the gallery is enabled, the link allows viewing and downloading. When guest uploads are also enabled, it allows guest uploads. Invitation links and gallery links grant different permissions.
- Turning access or uploads off preserves the URL and QR code. It blocks the affected new operations and invalidates affected pending guest upload grants. Emergency token rotation invalidates the old URL and printed QR codes. Previously issued signed read URLs may remain usable until they expire.
- Upload to private storage using short-lived signed permissions. Check allowed type, size, file count, and configured limits. Verify the stored image before publishing it. A pending upload is hidden until successful validation and confirmation, after which it becomes visible automatically. Show retryable failures and make confirmation safe to repeat.
- Browse using pagination and lazy-loaded originals. When deleting a photo, hide it immediately and distinguish storage cleanup still pending from confirmed completion. A concurrent or late upload confirmation must never republish a deleted photo.

### 6.12 YouTube livestream

- Let Admins and Managers configure one optional YouTube livestream per wedding and enable, update, or hide it independently of event visibility.
- Validate the YouTube URL and use a trusted embed on the published wedding website when enabled. Show a YouTube viewing link when embedding is unavailable and keep the rest of the site usable. Organizers broadcast through YouTube.

## 7. Main screens

| Area | Screens |
|---|---|
| Account and onboarding | Signup, login, password recovery, create wedding, accept member invitation |
| Workspace | Overview, wedding settings, Admin member management |
| Planning | Event list and details, task list and filters |
| Guests | Invitation contacts, event assignment, RSVP and headcount summary, sharing, email outcomes |
| Vendors | Google Places discovery, My Vendors |
| Expenses | Expense summary, expense list and form |
| Website and livestream | Theme and content settings, preview, publication, YouTube settings |
| Gallery | Private gallery, uploads, photo management, link and QR sharing |
| Guest and public experience | Published wedding site, private invitation and RSVP, private gallery and guest upload |

## 8. Conceptual data model

| Entity | Product responsibility |
|---|---|
| **User and account credentials** | Registered organizer identity, session, and recovery. |
| **Wedding** | Private-data boundary, names, date, timezone, structured location, cover, and website, gallery, and livestream settings. |
| **Wedding Membership and Member Invitation** | Current access and role, or an email-bound invitation to join. |
| **Event and Task** | Wedding schedule and planning work with optional event and assignee links. |
| **Guest** | One named invitation contact, stable share link, capacity, invited events, RSVP, and email send metadata. |
| **Vendor** | Wedding-owned contact and agreed cost, optional Google Place ID, and linked events. |
| **Expense** | Dated INR amount with category and optional event and vendor references. |
| **Photo** | Wedding gallery record with optional event, lifecycle state, and private storage reference. |
| **Email Job** | Bulk guest invitation or reminder outcome, retry state, and recipient. |

The wedding owns website, gallery, and livestream settings directly. All wedding-owned references, reads, writes, and aggregates are scoped to the current wedding.

## 9. Non-functional requirements

- **Mobile and accessibility.** Support the core organizer and guest journeys on phones and desktops. Provide labeled forms, keyboard access, readable contrast, and actionable validation and failure states.
- **Authorization and privacy.** Enforce current membership or link capability on the server. Private invitation and gallery pages use no-store, no-referrer, and noindex controls. Return sharing capabilities only through authorized sharing operations and signed private-media URLs only through authorized media responses. Published content may include intentionally public cover URLs, but never private gallery capabilities or private photo URLs. Keep secrets and signed URLs out of logs and unrelated responses.
- **Consistency and recovery.** Enforce one wedding per user and at least one Admin per active wedding during concurrent changes. Guard RSVP updates, event and vendor archiving, photo confirmation and deletion, and repeated job submissions against conflicting operations. Apply request and upload limits. Surface failures when a change has not been saved.
- **Performance.** Use bounded pagination and direct media transfers. Design for approximately 1,000 invitation records and 5,000 photos per wedding, subject to quotas and deployment verification. The initial configurable ceiling is 10 MiB per photo. Workspace views update after mutations, navigation, or refresh.
- **Operations.** Use isolated test and production environments, verify provider configuration and scheduled email throughput, and define a backup/export and restore process covering database records, private media, and required keys before using real guest data. Document manual photo storage cleanup and monitor usage.

## 10. V1 acceptance criteria

1. A user can sign up, log in, and reset their password. Older sessions lose access after reset, and expired or reused reset links fail.
2. An organizer can create one wedding or accept an email-bound invitation. Concurrent attempts cannot create two memberships for the same user. A wedding can have multiple Admins and cannot lose its final Admin. Removing a member revokes workspace access and clears their task assignments.
3. Both organizer roles can plan events and tasks, track guests and expenses, publish the website, and manage the gallery and livestream. Only Admins can administer membership.
4. When a pending invitation to two events is accepted for a party of three, the wedding headcount increases by three and each event estimate includes three. An identical retry adds no further people. Over-capacity and conflicting stale updates are rejected. Archiving one event removes it from the invitation itinerary and preserves the RSVP for the other.
5. Organizers can share an invitation without email, send individual emails, queue bulk work, see outcomes, and remind pending contacts. A queued reminder is cancelled if the guest has since replied. Deleting an invitation invalidates its old link and cancels unsent pending jobs.
6. Organizers can find a vendor through Google Places or add one manually, link multiple events, and keep using My Vendors during a discovery outage. Recording or changing a vendor cost leaves expense totals unchanged until an explicit expense is entered. Archiving a vendor preserves existing expense links.
7. Publishing and changing themes preserve the wedding URL and content. Only active public events appear on the site. Private organizer data and private links are omitted. An enabled wedding livestream displays a YouTube embed or a viewing fallback.
8. A guest on mobile can use a gallery QR code and upload an allowed photo when guest uploads are enabled. Successful confirmation publishes one private photo. Invalid files and disabled access prevent publication. Retrying confirmation creates no duplicate. Deletion during confirmation prevents the photo from reappearing.
9. The gallery URL survives routine settings changes. Disabling gallery access prevents new guest access. Rotation invalidates old links and QR codes. Cross-wedding identifiers and guest links cannot access or modify unrelated private data.
10. The organizer and guest journeys work on mobile and desktop. Deployment checks cover private media, production cookie protections, job recovery and delivery cadence, and provider failure states.

## 11. Delivery sequence

All phases belong to V1.

| Phase | Deliverable |
|---|---|
| **1 — Foundation** | Accounts, sessions and recovery, wedding creation, membership and permissions, workspace navigation |
| **2 — Planning** | Events, archive behavior, tasks, and overview dashboard |
| **3 — Guests and email** | Invitation contacts, stable links, RSVP summaries, individual sends, bulk jobs, and reminders |
| **4 — Vendors and expenses** | Google Places discovery, My Vendors, expense entry, and INR totals |
| **5 — Website and livestream** | Themes, stable URLs, publication, public event visibility, and the YouTube embed |
| **6 — Gallery and release** | Private gallery link and QR, upload, validation, deletion, privacy checks, and end-to-end validation |

## 12. Out of scope

- Guest accounts, named household rosters, per-event RSVP responses, spreadsheet guest import/export, and scheduled reminder campaigns.
- Overall budgets, allocations, remaining balances, vendor payment schedules, reconciliation, invoices, and receipt storage.
- A curated vendor marketplace, vendor accounts, per-event shortlist or booking tracking, live availability, booking transactions, and vendor payouts.
- Gallery albums, organizer approval queues, separate upload-only and viewing links, video uploads, bulk downloads, face recognition, and generated thumbnails.
- WhatsApp integration, travel coordination, room allocation, and pickup management.
- Subscription billing, custom domains, a full website builder, and native livestream broadcasting.
- Separate family workspaces, real-time collaboration, detailed activity history, and product analytics.
- User-facing whole-wedding deletion. Any future destructive action requires a separate product and API decision.

## 13. Design alignment and open release parameters

### 13.1 Design alignment

- **RSVP storage and reporting.** Use the database design's unset count for **Pending**. Report zero people for pending invitations in aggregate totals. Use the same saved response for every active invited event. See system design §8 and database design §§43–46.
- **Livestream and permissions.** Use the single wedding-level livestream in the database design and display it on the published site as described by the system design. Membership administration is Admin-only. Both roles can publish. Whole-wedding soft deletion exists in the data model, with any user-facing action deferred. See system design §§5 and 11 and database design §§21 and 92.
- **Link lifecycles.** Guest invitation links remain stable while their record exists. Guest removal invalidates the link. Standalone guest invitation token rotation is outside the current design baseline. Gallery emergency rotation is an operational recovery procedure, not an organizer UI or API operation in V1. See system design §10, database design §§19–20 and 43–48, and API design §15.
- **Technical baseline.** Angular 21 and TypeScript, a NestJS REST API on Node.js, MongoDB Atlas with Mongoose, and Zod form one coordinated Vercel deployment. Private Cloudflare R2 stores photos, Resend delivers email, Vercel Cron processes bulk jobs, Google Places supplies vendor discovery, and YouTube supplies livestream playback.

### 13.2 Open before production use

API design §16 selects initial defaults: JPEG, PNG, and WebP images up to 10 MiB; at most 20 files per UI selection, uploaded sequentially; 10-minute signed upload URLs; confirmation until 24 hours after upload URL expiry; and 15-minute signed read URLs. API design §10 bounds an invitation to 100 distinct event IDs. Validate these defaults before release and update the affected contracts together if they change.

| Area | Decision or verification needed |
|---|---|
| Email throughput | Choose a supported production cron cadence and batch size that meet the intended bulk delivery turnaround. Verify actual throughput, sender setup, and provider limits. |
| Guest and media limits | Finalize invitation headcount, wedding-level event limits, aggregate wedding storage quota, and upload rates. Validate the API's selected media and invitation-array defaults. Review atomic admission accounting if a hard quota must hold across concurrent uploads. |
| Expiry and retention | Set session, reset, and member-invitation lifetimes and retention for terminal email jobs, request ledgers, and photo cleanup records. Validate the selected signed-media URL lifetimes. |
| Recovery | Verify MongoDB and R2 backup and restore, recovery of separately managed keys, and the manual procedure for orphaned or partially deleted uploads. |
| Legacy RSVP data | If earlier per-event responses exist, agree how they will be mapped before any migration. Different responses across events cannot be collapsed without losing information. |
