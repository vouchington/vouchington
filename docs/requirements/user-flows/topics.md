# Topics — User Flow Matrix

[← User Flows](./README.md)

Authorization: all management (create / edit / merge / aliases / domains) is **admin-only** (`requireAdmin()`, `TOPICS.md:5`). SM has no elevated topic powers. Delete is intentionally unsupported — merge instead.

Spec paths relative to `playwright/tests/`.

| Flow                                                      | Personas      | Existing spec                                                                 | Status                                                                                                |
| --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Browse `/topics` (list, filters, per-type lists)          | Anon, RU      | `topics/topic-detail-tabs.spec.mts`, `routes/page-coverage-baseline.spec.mts` | 🟡 per-type list smoke; `/topics` list not fully asserted (T1)                                        |
| Topic detail header (semantic trust choice, follow, tabs) | Anon, RU      | `topics/topic-detail.spec.mts`                                                | ✅                                                                                                    |
| Topic detail tabs (redirect, switching, empty states)     | Anon          | `topics/topic-detail-tabs.spec.mts`                                           | ✅                                                                                                    |
| Topic asides (communities, related, FAQ)                  | Anon          | `topics/topic-asides.spec.mts`                                                | 🟡 communities aside covered; others smoke only (T2)                                                  |
| Follow / Unfollow topic                                   | Anon, RU      | `topics/topic-detail.spec.mts`                                                | 🟡 follow button visible; toggle not exercised (T9)                                                   |
| Mute topic (authenticated mute toggle)                    | RU            | `navigation/bookmarks-pages.spec.mts`                                         | 🟡 generic bookmark action; no topic-specific mute toggle (T3)                                        |
| Semantic trust choice (topic vote)                        | Anon, RU      | `topics/topic-detail.spec.mts`                                                | 🟡 Vouch click covered; Disavow not exercised (T10)                                                   |
| Suggest a Topic (topic_recommendation create/edit)        | RU            | `topics/web-search.spec.mts`, `routes/page-coverage-baseline.spec.mts`        | 🟡 route smoke; full create flow not covered (T4)                                                     |
| Manage tags on topic                                      | RU, SA        | `topics/topic-detail-tabs.spec.mts`                                           | 🟡 tab visible; tag add/remove not exercised (T5)                                                     |
| Admin: create topic                                       | SA, Anon(neg) | `admin/topics-edit.spec.mts`                                                  | 🟡 redirect tested; full create not exercised (T6)                                                    |
| Admin: edit name / markdown / logo / hero                 | SA            | `admin/topics-edit.spec.mts`, `topics/topic-images.spec.mts`                  | ✅                                                                                                    |
| Admin: edit behavior flags (noindex, allow_reviews)       | SA            | `admin/topics-types-consolidation.spec.mts`                                   | ✅                                                                                                    |
| Admin: merge topics (end-to-end)                          | SA            | `topics/aliases.spec.mts`                                                     | 🟡 merge UI elements visible; full merge + redirect not exercised (T7)                                |
| Admin: manage aliases                                     | SA            | `topics/aliases.spec.mts`, `admin/topics-edit.spec.mts`                       | ✅                                                                                                    |
| Admin: manage domains                                     | SA            | `admin/manage-source.spec.mts`                                                | ✅                                                                                                    |
| SM / RU: no management controls visible                   | SM, RU        | `admin/manage-source-persona-boundary.spec.mts`                               | 🟡 spec uses `rss_feed`/source topic only; regular `/topic/…` route SM/RU boundary not exercised (T8) |

## Workstream Key

| Label | Description                                                                  | Tracking |
| ----- | ---------------------------------------------------------------------------- | -------- |
| T1    | `/topics` browse list — search, per-type filter, result count                | TBD      |
| T2    | Topic aside content beyond communities (related topics, FAQ, referral links) | TBD      |
| T3    | Topic mute toggle (authenticated) via `topic-actions-aside`                  | TBD      |
| T4    | Topic recommendation (Suggest a Topic) full create flow                      | TBD      |
| T5    | Manage tags on topic — add and remove a tag                                  | TBD      |
| T6    | Admin create topic — full form submit and redirect                           | TBD      |
| T7    | Topic merge end-to-end — input confirmation, submit, redirect to destination | TBD      |
| T8    | SM / RU explicitly confirmed to see no topic management controls             | TBD      |
| T9    | Follow / Unfollow topic — click toggle and verify state change               | TBD      |
| T10   | Topic Disavow (−2) click and state verification                              | TBD      |
