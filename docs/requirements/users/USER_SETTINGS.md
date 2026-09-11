# User Settings

## Navigation

Settings sidebar groups items with section headers:

- **Account**: Identity, Profile, Landing Pages, Preferences, Privacy
- **Financial**: Cards, Household, Spending, Point Values, Statuses, Membership
- **Advanced**: API Keys, Notifications, Find Friends, Your Data

Headers use `text-xs font-medium uppercase tracking-wide text-muted-foreground`. Active page is highlighted. Desktop shows grouped vertical nav; mobile uses flat horizontal scroll.

## Identity

- `username` - allow the user to select a username. Cannot select a used username.
- `user_display_name_source` - allows the user to use a display name from one of their connected accounts, e.g. their facebook name, twitter handle, or their Voucha username
- `profile_image_id` - allow the user to add or remove their profile avatar
- `user_profile_image_source` - allows the user to select the source of their avatar image, e.g. their facebook profile image, twitter profile image, or their Voucha profile image.

Allow users to connect or disconnect other accounts:

- Facebook
- Apple
- Google
- X
- LinkedIn
- Microsoft
- GitHub

OAuth connect buttons use proper provider branding (see [OAuth provider buttons](../navigation/reference-components-patterns.md#oauth-provider-buttons)).

Facebook, X, and GitHub use the same server-begun broker contract on web, Swift, and .NET when the
corresponding advertised client-mode capability is enabled. Web completes with a path-scoped
HttpOnly cookie. Native clients persist the in-flight flow and proof verifier in secure storage,
resume after a cold launch, and reject a custom-scheme token that lacks the proof verifier.
Authentication and connection use the same broker state machine but retain distinct ownership
rules.

Allow users to add or remove email addresses. Each email address must be verified before being added. OAuth-only users may legitimately start with no email addresses; the empty state says `No email addresses yet` and supports adding and verifying the first address. That first verified address becomes primary.

Web, Swift, and .NET expose the same email-address management and inline recovery flow. When an
action returns `EMAIL_VERIFICATION_REQUIRED`, preserve drafts or roll back optimistic state, open
the native add-and-verify flow, then show `Email verified. Try your action again.` Do not
automatically replay the interrupted action.

One identity account must be used (e.g. Facebook/X/GitHub/etc. or an email address).

Allow users to view and revoke active auth sessions on `/my/identity`, including the current device and all devices.

Web lets a user link or disconnect a Bluesky account from `/my/identity` through the AT Protocol
OAuth redirect flow. Swift and .NET render the same account-linking state and actions in native
settings, launch authorization in the system browser, and finish through a one-time app handoff.
The native handoff binds the authenticated user, a purpose-bound completion token, and an
app-retained SHA-256 proof verifier; an intercepted custom-scheme token is insufficient by itself.
Bluesky account linking is distinct from the ActivityPub federation opt-in.

## Data Display Rules

- **No UUIDs**: Internal IDs (e.g. household ID) must not be shown to users
- **Number formatting**: Strip trailing zeros from decimal displays (e.g. show `2¢` not `2.0000¢`)

## Financial Workflows

These signed-in workflows must use dedicated UI at their canonical routes. A generic profile or
settings page does not satisfy the route.

### Cards

- `/my/cards` lists, creates, edits, and removes the member's cards.
- Card selection searches card topics and displays names instead of internal IDs.
- Editors support opened, closed, and sign-up-bonus dates, a non-negative credit limit,
  authorized-user state with an eligible parent card, and an optional note.
- Disabling authorized-user state clears the parent-card relationship. Removal requires
  confirmation. Failed mutations preserve the draft or row.

### Household

- `/my/household` is a dedicated management surface on web, Swift, and .NET. The clients consume the
  same household and membership API fixtures documented by the
  [client feature parity contract](../client-feature-parity.json).
- A user may intentionally own multiple households, such as while managing parents' or
  grandparents' accounts. Backend authorization remains scoped to each household. Clients request
  `access=owned&limit=1` and manage only the most recently updated owned household; additional owned
  households remain valid and accessible through the API but are omitted from this client surface.
- Every household in which the user is only a member remains visible as a separate read-only
  section. A member-only household never becomes manageable. If the user has no owned household,
  the create action remains available even when read-only households are present, but only after a
  successful list response confirms that no owned household exists. Starting a new list request
  disables creation until that request succeeds; a failed initial load or refresh never enables it.
- Member-only households use an independent `access=member` cursor traversal. Memberships also
  paginate independently per household. One failed section does not hide successful sections, and
  retry reloads only the failed section. Stale list and membership responses must not replace newer
  state.
- Member identity displays as `@username`, or exactly `Household member` when no username exists.
  Internal UUIDs and UUID prefixes are never rendered. Relationships render only when nonblank.
- Member removal is owner-only and requires confirmation. The confirmed row disappears
  optimistically. Duplicate requests for the same membership are suppressed, removals for different
  memberships may remain in flight together, and a failure restores the row at its original clamped
  index without introducing a duplicate.
- Invitations, relationship editing, ownership transfer, household deletion, and member
  self-removal remain outside the current scope.

### Spending Categories

- `/my/spending-categories` lists, creates, edits, and removes personal and household spending
  categories through an owner-scoped cursor list. Household entries shared with a non-owner remain
  visible but are read-only; the API exposes that capability as `can_manage`.
- Category search accepts spending-category topics only.
- Amount is non-negative. Frequency is monthly or annual. Note is optional.
- Spending-category visibility remains a separate privacy preference.

### Reward Statuses and Point Values

- `/my/rewards-program-statuses` manages loyalty statuses. Search accepts
  `rewards_program_status` topics only. Since and until dates are optional, and since cannot be
  later than until. Creating a status selects only the topic; dates are added or cleared through
  an update. Repeating the same status topic is allowed.
- `/my/rewards-program-point-valuations` manages currency-aware personal point values. Search
  accepts rewards programs only. Value follows the
  [scale-six point-valuation contract](../../overview/architecture/monetary-values.md#public-types),
  and note is optional.
- Both workflows use owner-scoped cursor pagination in ascending row-ID order, with a default page
  size of 25 and a maximum of 100. The point-valuation API reads and writes
  `{ amount, currency, scale: 6 }`; clients parse human input exactly and format values for the
  selected currency without forced trailing zeroes. See the
  [cross-surface pagination contract](../../overview/architecture/pagination.md).
- Web, Swift, and .NET display hydrated names, confirm removal, preserve drafts after failure, and
  continue from opaque cursors without dropping optimistic local changes. Removal is optimistic
  after confirmation and restores the row at its original clamped index if the request fails.
  Duplicate in-flight mutations for the same row are suppressed while different rows may update
  concurrently.

## Profile

- `markdown` aka About - allow users to create an about me section. Note that this will be public.

Allow users to add links to their profile:

- These can be URLs w/ names and images or social media links (Facebook/X/etc.).
- If these are social media links, only a handle is required.
- Allow users to reorder their links on their profile

## Related

- [Client Parity Matrix](../CLIENT-PARITY-MATRIX.md)
- [Client feature parity contract](../client-feature-parity.json)
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](./ACCOUNT-DELETION-DATA-REQUEST.md)
