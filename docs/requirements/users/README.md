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
| [Account Deletion](./ACCOUNT-DELETION-DATA-REQUEST.md)                 | Account erasure and durable deletion lifecycle                                          |
| [Account Data Export](./ACCOUNT-DATA-EXPORT.md)                        | Data portability, export lifecycle, and status routes                                   |
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

## Reference index

- [OAuth Apps and Connected Apps](oauth-apps.md)
- [Memberships reference](reference-memberships-architecture.md)
- [Memberships reference](reference-memberships-contribution-gating-anti-bot.md)
- [Memberships reference](reference-memberships-refunds.md)
- [Referral Links reference](reference-referral-links-admin-validation-management.md)
- [Referral Links reference](reference-referral-links-my-referrals-click-log.md)
- [Referral Links reference](reference-referral-links-suggesting-referral-programs.md)
- [Referral Links reference](reference-referral-links-url-validation.md)
