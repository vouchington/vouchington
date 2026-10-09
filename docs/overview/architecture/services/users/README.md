# @services/users

Source entrypoint: [backend/services/users/README.md](../../../../../backend/services/users/README.md)

Core user service — authentication flows, authorization, profile management, search, followers, metrics, and account lifecycle.

## Key areas

| Sub-module                                         | Purpose                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `create`                                           | `upsertUser` signup/login user creation with concurrent email/phone race recovery     |
| `authentication`                                   | Password/token auth, session management                                               |
| `authentication-flows`                             | Sign-up, sign-in, sign-out, OAuth link flows                                          |
| `authorization`                                    | `currentUserCan*` permission checks                                                   |
| `get` / `get-public-batch` / `get-private-batch`   | Single and batch user fetches                                                         |
| `search`                                           | Paginated user search with filters                                                    |
| `update` / `update-fields` / `update-contact-info` | Profile and contact information updates; email/phone updates require OTP verification |
| `followers`                                        | Follow/unfollow, follower counts and lists                                            |
| `metrics` / `metrics-batch`                        | User activity metrics                                                                 |
| `profile-collections`                              | User-curated post collections                                                         |
| `privacy`                                          | Privacy setting management                                                            |
| `display-name`                                     | Display name validation and formatting                                                |
| `suspension`                                       | Admin user suspension                                                                 |
| `delete`                                           | Immediate account privacy fence and durable deletion request                          |
| `preservation-holds`                               | Admin legal-process hold that blocks account deletion; the reference is encrypted     |
| `delete-row-locks`                                 | Ascending-id `users` row locks for a deletion target and its requesting actor         |
| `delete-oauth-pii`                                 | GDPR erasure: scrub OAuth PII on deletion                                             |

Account deletion first tries the same transaction-scoped user-lifecycle advisory lock held by
active-user writers. A failed try reports real lock contention to the optional synchronous internal
`onLockContention` observer, then acquires that same lock with the ordinary blocking query before
the publication and user-row locks. An observer error aborts the transaction. The uncontended path
uses one lock query; contention uses two, and the gap before the blocking query does not establish
a PostgreSQL wait-queue position. The active-user check still rejects writes after deletion commits.

## Deletion completion

`deleteUser` commits the account privacy fence and durable deletion request before starting
cache invalidation and immediate cache eviction. It waits for both follow-ups to settle before
propagating a failure. A single rejected follow-up retains its original rejection reason; multiple
rejections are preserved in an `AggregateError` in follow-up order. Immediate cache eviction also
waits for every started cache receipt write before reporting failures through its existing
best-effort error boundary, preserving multiple receipt failures together.

On the successful follow-up path, it waits for the best-effort bookmark-filter enqueue to settle,
then attempts the initial user-deletion enqueue. The queue factory reports asynchronous
bookmark enqueue failures; the best-effort wrapper reports synchronous failures. An enqueue
failure does not undo the committed privacy fence or durable request. PostgreSQL recovery
continues to own deletion correctness.

Returning the deletion attempt establishes completion of these enqueue attempts, while
[durable deletion processing](../user-deletions/README.md) owns subsequent erasure and finalization.

## User view row shapes

The [public and private user views](../../../../../backend/data-stores/psql/views/2025-01-01-view-users.sql)
return SQL `NULL` for absent display accounts, linked OAuth providers, primary contact rows, and
nullable base-user fields. Keep those values nullable in the
[canonical user types](../../../../../backend/types/entities/user.mts); JSON serialization preserves `null` rather
than omitting a selected column.

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- Auth overview: [../../../docs/overview/architecture/auth-overview.md](../../auth-overview.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../../requirements/security/AUTH.md)
- Users requirements: [../../../docs/requirements/users/USERS.md](../../../../requirements/users/USERS.md)
- Account-deletion lifecycle: [../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../../../../requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md)
- Durable deletion lifecycle service: [../user-deletions/README.md](../user-deletions/README.md)
- My service: [../my/README.md](../my/README.md)

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

- `createPhoneNumberLoginToken`
- `getUserByPrimaryEmail`
- `updateUserEmailAddress`
- `updateUserPhoneNumber`
- `upsertAdminEmailAddresses`
