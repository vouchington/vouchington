# Referral Links reference

[Back to Referral Links](REFERRAL-LINKS.md)

## Admin Validation Management

Admins can manage validation sets and rules. These pages are scoped to a `referral_program` topic and gated by `requireAdmin()` AND `topic_type === 'referral_program'` (else `notFound()`); they are no longer under `/admin/**`.

### Routes

| Path                                               | Purpose                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/referral-program/:id/validations`                | List the shared validation pool (manage-all surface; supports `?search=`)               |
| `/referral-program/:id/validations/new`            | Create a new validation set                                                             |
| `/referral-program/:id/validations/:validationId`  | Edit a validation set and manage its rules                                              |
| `/referral-program/:idOrSlug/settings/validations` | Link/unlink validations for a specific referral program (Settings dropdown, admin-only) |

### API Endpoints (../Admin)

**`POST /api/v1/topics/:referralProgramId/referral-program/link-validations`**

- Body: `{ "validation_id": "..." }`
- Requires admin (`currentUserCanUpdateTopic`)

**`DELETE /api/v1/topics/:referralProgramId/referral-program/link-validations/:validationId`**

- Requires admin (`currentUserCanUpdateTopic`)

Client-side API helpers are in `web/lib/api/client/referral-link-validations.ts`.

## Database Schema

- **`user_referral_program_links`**: User-created referral links for referral programs
- **`session_referral_attributions`**: Tracks inbound referral attributions (when users arrive via shared Voucha links). Not used for outbound referral link click tracking.

## Landing Page Integration

Referral links are the core revenue driver for landing pages (@username pages). The landing page system creates a growth flywheel:

1. **User creates landing page** — Onboarding step 4 prompts landing page creation
2. **User shares link** — @username in social media bios (Twitter, Instagram, LinkedIn)
3. **Visitors see referral links** — Prioritized by social graph (friend's link > stranger's)
4. **Clicks generate revenue** — Affiliate/referral conversions
5. **Visitors sign up** — Create their own landing pages → cycle repeats

### Landing Page Optimization Priorities

- **Dynamic OG images**: User avatar, name, top referral categories for social sharing
- **UTM parameter tracking**: Source attribution (which social platform drove the visit)
- **Click analytics**: Per-link clicks, conversion over time, source breakdown
- **Mobile-first**: Instagram/Twitter bio link traffic is predominantly mobile
- **Quick setup**: Less than 60 seconds from onboarding to shareable page

### Cross-References

- Landing page service: `backend/services/my/landing-pages/`
- Referral link click tracking: `backend/services/attribution/create.mts`
- Prioritized query: `backend/services/prioritized-referral-links/`
- Strategy doc: [docs/strategy/landing-pages-strategy.md](../../strategy/landing-pages-strategy.md)

## Auto-Follow on Signup

When a referred visitor creates an account, the new user automatically follows the referrer:

- Implemented via `enqueueAutoFollowReferrer(newUserId, referrerId)` fired from `upsertUser`
- Runs as a `processAutoFollowReferrer` entity-listener job
- Creates a `relation__user__follow__user` row: `subject_id = newUserId`, `object_id = referrerId`
- This triggers `enqueueFollowNotification` (wired into `upsertEntityRelation`), which sends a follow notification to the referrer with referral-context copy ("Your referral @username signed up and followed you!")

## Referral Notifications

### Click Notification

When a visitor arrives via a referral link, the referrer receives a `referral_click` in-app notification:

If the visitor sends active Global Privacy Control (`Sec-GPC: 1`), runtime tracking is suppressed:
the Next.js proxy skips session referral attribution and no referral-click notification is created.

- **Title**: "Someone clicked your referral link"
- **Body**: Truncated landing URL
- **Target path**: `/my/referrals`
- **Dedup**: 5-minute debounce keyed on referrerId — rapid clicks collapse into one notification
- **Actor**: Anonymous (no `actor_user_id`)

### Signup Notification

When a referred visitor creates an account, the referrer receives a `referral_signup` in-app notification:

- **Title**: "@{username} signed up through your referral!" (or "Someone signed up through your referral!" if no username)
- **Body**: "You now have N referral(s)" (live count from `users WHERE referrer_id = ?`)
- **Target path**: `/@{username}` (new user's profile)
- **Actor**: The new user (`actor_user_id = newUserId`)
- **Follow notification overlap**: If the new user also auto-follows the referrer (PR 1), a separate `follow` notification is sent with referral copy ("Your referral @username signed up and followed you!"). Both notifications fire independently.

Both notifications trigger browser push delivery via the existing push dispatch pipeline.

## Manage Referral Links

### Route

`/my/referral-links` — requires authentication.

### Purpose

A management page where users can see and edit **all** of their referral links across every referral program, in one place. Links are grouped by program and sorted alphabetically by program name.

### Features

- **Grouped view**: Links grouped by referral program. Each program section shows all the user's links for that program.
- **Inline label editing**: Edit the display label for any link without leaving the page.
- **Activate / Deactivate**: Toggle a link's active status. Only active links (`activated_at IS NOT NULL AND deactivated_at IS NULL`) are shown on the public referral links tab. When deactivated, the link is hidden from the prioritized query.
- **Delete**: Remove a link with a two-step confirmation.
- **Add new links**: Search for a referral program using the autocomplete, then navigate to that program's referral links tab (`/:topicType/:id/referral-links`) to add a new link. URL validation and program-specific rules are enforced there.
- **Pagination**: "Load more" button when results exceed the default page size (50).

### "Only one per user per page" guarantee

The prioritized referral links query uses `DISTINCT ON (al.user_id)` to ensure each user appears at most once per program on public-facing pages.

A user may have **multiple active links** for the same program (e.g., different URLs). When that happens, the query picks the one with the most recent `activated_at` timestamp. The active status indicator (green dot) on the manage page means the link is _eligible_ to appear publicly — not that it is necessarily the one currently shown. If you have more than one active link for a program, deactivate the others to control which URL is displayed.

### API used

- `GET /api/v1/referral-links` — lists all of the user's links across all programs (no `referral_program_id` filter)
- `PATCH /api/v1/referral-links/:id` — update label
- `DELETE /api/v1/referral-links/:id` — soft delete
- `POST /api/v1/referral-links/:id/activations` — activate
- `DELETE /api/v1/referral-links/:id/activations` — deactivate

### Implementation

- **Page**: `web/app/(my)/my/referral-links/page.tsx`
- **Manager component**: `web/components/my/referral-links-manager.tsx`
- **Settings nav entry**: "Referral Links" under Preferences tab (alongside "Referral Clicks")
- **Native clients**: SwiftUI and .NET MAUI mirror the management flow natively: users manage
  existing links from My Referral Links, search referral-program topics to start a create flow,
  edit labels, activate/deactivate links, and delete links with confirmation. Native clients must
  keep this as first-party UI, not a WebView fallback.

---
