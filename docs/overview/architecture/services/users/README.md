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
| `delete-row-locks`                                 | Ascending-id `users` row locks for a deletion target and its requesting actor         |
| `delete-oauth-pii`                                 | GDPR erasure: scrub OAuth PII on deletion                                             |

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
