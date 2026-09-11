# Contribution Limits

Contribution limits control public content and entity creation after route authentication and
action-specific authorization. They are separate from generic route rate limits, which remain in
place for API abuse protection.

## Dynamic Configuration

All values are runtime-configurable through DynamicConfig namespace `contribution-rate-limits`.

Field naming:

- `<action>_<tier>_<window>_limit`
- `<action>_<tier>_<window>_window_seconds`

The six authored-policy rows below use `free`, `plus`, `pro`, and internal operator-only
`safety` tiers. Safety is a distinct live field initialized to the Pro value and is not returned
from public contribution status. Existing non-authored action fields and their just-joined/admin
semantics remain unchanged.

Limit values:

- `-1` = unlimited for legacy/admin fields only; authored Free/Plus/Pro/Safety fields must be
  positive finite integers
- `0` = blocked
- positive integer = allowed count per configured window

## User Tiers

| Tier          | Meaning                                                     |
| ------------- | ----------------------------------------------------------- |
| `just_joined` | Free account younger than the 7-day contribution gate       |
| `free`        | Free account outside the just-joined window                 |
| `plus`        | Active Plus member                                          |
| `pro`         | Active Pro member                                           |
| `admin`       | Administrator or verified system actor; exempt from budgets |

## Default Matrix

| Bucket                | Safety         | Pro           | Plus          | Free          | Just joined |
| --------------------- | -------------- | ------------- | ------------- | ------------- | ----------- |
| All authored posts    | 1/5m, 50/day   | 1/5m, 50/day  | 1/10m, 25/day | 1/15m, 10/day | blocked     |
| Reviews               | 1/10m, 3/day   | 1/10m, 3/day  | 1/30m, 2/day  | 1/60m, 1/day  | blocked     |
| Comments/replies      | 1/5m, 50/day   | 1/5m, 50/day  | 1/10m, 25/day | 1/15m, 10/day | blocked     |
| Discussions/links     | 1/15m, 10/day  | 1/15m, 10/day | 1/30m, 5/day  | 1/60m, 3/day  | blocked     |
| Topic recommendations | 1/15m, 10/day  | 1/15m, 10/day | 1/30m, 5/day  | 1/60m, 3/day  | blocked     |
| Data points           | 1/15m, 20/day  | 1/15m, 20/day | 1/30m, 10/day | 1/60m, 5/day  | blocked     |
| Articles/blog posts   | not configured | forbidden     | forbidden     | forbidden     | forbidden   |

## Covered Actions

- Safety applies only to `authored_post`, `discussion`, `review`, `comment`, `data_point`, and
  `topic_recommendation`; topic, community, RSS-feed, post-rating, and fediverse-instance policy
  is unchanged.
- Generic post creation maps links, story discussions, and RSS-item discussions to `discussion`.
- Each authored post atomically consumes an internal `authored_post` aggregate policy and its mapped
  type policy through the PostgreSQL admission reservation. PostgreSQL is the sole authority for
  authored capacity. Daily-only topic imports persist `daily_only` consumption: they consume
  aggregate and type daily capacity, but are excluded from both short-window counts.
- Articles and blog posts are structurally rejected for non-admin direct creation before CAPTCHA
  or policy checks. Verified administrators and system actors are budget-exempt; community root
  post types do not expand for admins.
- Direct topic recommendations run suspension and the standard contribution gate before parsing or
  CAPTCHA. They remain behind the age gate and create a recommendation for review, not an immediate
  topic. Imports still follow existing topics; only missing names that need recommendations fail.
- Topic recommendations, direct admin topic creation, community creation, RSS feed/source creation,
  and post ratings use their explicit action keys.

## Related

- [Rate limiting overview](../../overview/architecture/rate-limiting.md)
- [Membership contribution gates](../users/memberships.md#contribution-gating-ui-behavior-and-related)
- Service: `backend/services/contribution-gating/`
- Web client: `web/lib/api/client/admission-idempotency.ts`

## Admission replay contract

Authored create requests may include a UUID `Idempotency-Key` during the rollout. The same canonical
intent reuses its key for a lost-response or manual retry, then receives the original committed
response. A changed intent receives a new key. Reusing a key for a different intent returns 409
`IDEMPOTENCY_KEY_REUSED`; a still-running reservation returns 409
`CONTRIBUTION_ADMISSION_IN_PROGRESS` with `Retry-After`. Global and type capacity rejection returns
429 without exposing thresholds, Safety policy, or moderation state. The public contribution status
is limited to `{ allowed, reason, retry_after_seconds }`.

The web client persists that UUID in browser storage and takes a Web Lock so independent tabs for
the same actor and canonical intent reuse one in-flight key. Authenticated durable admission fails
closed when Web Locks are unavailable.

An exact committed retry refreshes both server replay boundaries to another 48 hours plus the
bounded five-minute clock-skew margin from the PostgreSQL clock. A mismatched or already expired key
never extends its prior record: the mismatch remains a 409, while an expired key is replaced before
a new mutation can commit.

Free Turnstile/App Attest work runs before capacity. A non-consuming PostgreSQL preflight rejects
exhausted callers before paid reCAPTCHA; the locked transactional PostgreSQL check is the commit
authority.
