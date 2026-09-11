# @services/my

Current-user ("my") account management — identity, email addresses, profile, profile links, and landing pages.

## Sub-modules

| Sub-module        | Key exports                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity`        | `updateUsername(userId, username)`, `updateProfileImageId(userId, imageId)`                                                                                                   |
| `email-addresses` | `listEmailAddressesPage(userId, options)`, `createEmailVerificationToken(...)`, `verifyEmailVerificationToken(...)`, `setPrimaryEmailAddress(...)`, `removeEmailAddress(...)` |
| `profile`         | `getProfile(userId)`, `updateProfileMarkdown(userId, markdown)`                                                                                                               |
| `profile-links`   | `listProfileLinks(userId)`, `createProfileLink(...)`, `updateProfileLink(...)`, `deleteProfileLink(...)`, `reorderProfileLinks(...)`                                          |
| `landing-pages`   | Create, list, update, delete, and set-default for user landing page configurations                                                                                            |

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Users service: [../users/README.md](../users/README.md)
