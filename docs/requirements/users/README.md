# Users

User profiles, settings, privacy, account management, and membership features.

## Documents

| File                                                                   | Description                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Users](./USERS.md)                                                    | User profile routes, tabs, and management views                                         |
| [User Settings](./USER_SETTINGS.md)                                    | User preferences and settings pages                                                     |
| [User Privacy Feature Matrix](./USER-PRIVACY-MATRIX.md)                | User privacy, consent, data rights, and coverage matrix                                 |
| [User Profile Tab Matrix](./USER-PROFILE-TAB-MATRIX.md)                | Tab routes, data sources, access control, and count metrics for all public profile tabs |
| [User Relation Matrix](./USER-RELATION-MATRIX.md)                      | Follow, block, and mute relation management on profile pages                            |
| [Privacy](./PRIVACY.md)                                                | Post privacy levels and broadcast audience controls                                     |
| [Account Deletion & Data Request](./ACCOUNT-DELETION-DATA-REQUEST.md)  | GDPR and data management flows                                                          |
| [Preferences](./PREFERENCES.md)                                        | localStorage-based preference system and theme architecture                             |
| [Localization](./LOCALIZATION.md)                                      | UI locale, account country, content language, and future translation requirements       |
| [Memberships](./memberships.md)                                        | Plans, provider-neutral billing, entitlements, and admin grants                         |
| [Membership Billing PRD](./reference-memberships-store-billing-prd.md) | Accepted pre-launch provider, entitlement, recovery, and rollout contract               |
| [Referral Links](./REFERRAL-LINKS.md)                                  | Referral link submission, ranking, and click attribution                                |
| [Landing Pages](./LANDING-PAGES.md)                                    | Native and web item selection, drafts, saves, refreshes, and page switching             |
| [API Keys](./api-keys.md)                                              | API key system, permissions, RSS feed access, and rate limits                           |

## Sync Rule

When user profile fields, privacy settings, membership tiers, or account lifecycle flows change,
update the relevant doc here and cross-link from `docs/requirements/anatomy/user.md` and
`backend/services/`.
