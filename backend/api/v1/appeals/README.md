# Appeals API

Routes for the moderation appeals workflow.

## Routes

| Method  | Route                                   | Auth               | Description                                                          |
| ------- | --------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| `POST`  | `/api/v1/appeals`                       | Any signed-in      | File a new appeal against a warning, community ban, or post removal  |
| `GET`   | `/api/v1/appeals`                       | Any signed-in      | List appeals (staff: all; members: own only)                         |
| `GET`   | `/api/v1/appeals/:id`                   | Appellant or staff | Get a single appeal (redacted for members, full for staff)           |
| `PATCH` | `/api/v1/appeals/:id`                   | Staff only         | Edit the appeal draft (`public_response`, `internal_notes`)          |
| `POST`  | `/api/v1/appeals/:id/approval`          | Staff only         | Approve the current draft (sets `approved_at`)                       |
| `POST`  | `/api/v1/appeals/:id/delivery`          | Staff only         | Send the approved response to the appellant (sets `sent_at`)         |
| `POST`  | `/api/v1/appeals/:id/resolution`        | Staff only         | Resolve a delivered appeal (`action`: `accept`, `reduce`, or `deny`) |
| `POST`  | `/api/v1/appeals/:id/resolution-drafts` | Staff only         | Re-run AI drafting for an unapproved, unsent pending appeal          |

Staff mutation responses re-read the canonical full appeal from the primary database after the
lifecycle change is persisted. Immediate delivery and resolution-draft guards also use the primary
so an approve-then-send or lifecycle transition cannot observe a lagging replica.
Resolution-draft re-runs return `422` once an appeal is sent, resolved, or dismissed.
Resolution returns `422` until the approved response has been delivered.

**CAPTCHA:** `POST /api/v1/appeals` requires a Cloudflare Turnstile token in `cf_turnstile_response` (see [`@services/captcha`](../../../services/captcha/README.md)) — `422` if missing, `400` if rejected, `502` if siteverify is unreachable. Requests carrying valid Apple App Attest headers bypass this requirement — see [App Attest bypass](../../../services/captcha/README.md#app-attest-bypass) (actionTag: `appeals.create`).

## Performance

| Route                                      | Round trips                              | Cache hits | Cache-Control        |
| ------------------------------------------ | ---------------------------------------- | ---------- | -------------------- |
| GET /api/v1/appeals                        | 1 DB read                                | None       | None (auth-required) |
| GET /api/v1/appeals/:id                    | 1 DB read                                | None       | None (auth-required) |
| POST /api/v1/appeals                       | 1 DB write + queue enqueue               | None       | None                 |
| PATCH /api/v1/appeals/:id                  | 1 DB write + 1 DB read                   | None       | None                 |
| POST /api/v1/appeals/:id/approval          | 1 DB write + 1 DB read                   | None       | None                 |
| POST /api/v1/appeals/:id/delivery          | 2 DB reads + 1 DB write + notification   | None       | None                 |
| POST /api/v1/appeals/:id/resolution        | 1 DB read + 1 DB transaction + 1 DB read | None       | None                 |
| POST /api/v1/appeals/:id/resolution-drafts | 1 DB read + queue enqueue                | None       | None                 |
