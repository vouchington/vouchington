# @services/users

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
| `delete-oauth-pii`                                 | GDPR erasure: scrub OAuth PII on deletion                                             |

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Auth overview: [../../../docs/overview/architecture/auth-overview.md](../../../docs/overview/architecture/auth-overview.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../docs/requirements/security/AUTH.md)
- Users requirements: [../../../docs/requirements/users/USERS.md](../../../docs/requirements/users/USERS.md)
- Account-deletion lifecycle: [../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md)
- Durable deletion lifecycle service: [../user-deletions/README.md](../user-deletions/README.md)
- My service: [../my/README.md](../my/README.md)
