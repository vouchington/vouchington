# Upsert Semantics

[Back to Admin Imports Service](README.md#upsert-semantics)

### Topics

- **Keyed by `slug`**: if a topic with the given slug exists, it is updated; otherwise, it is created.
- **Only non-empty values are updated**: empty CSV cells leave the corresponding field unchanged on existing topics.
- **RSS feed**: if `rss_feed_url` and `rss_feed_title` are provided (only valid for `rss_feed` topics), the hostname is upserted and linked to the topic, then the RSS feed is upserted (updated if one exists for the topic, created otherwise).
- **RSS feeds must use dedicated rows**: attaching `rss_feed_url` to `organization`, `brand`, or other non-`rss_feed` topics is rejected at validation time. Each feed must live on its own `topic_type=rss_feed` row with `parent_slugs` linking it to its owning organization.

### CRM Contacts

CRM contact rows are keyed by normalized lowercase `email`. For existing rows, omitted columns preserve the current value. Present blank cells clear nullable scalar fields, and present nonblank cells update the corresponding field.

| Column           | Required | Create behavior                      | Existing-row update behavior                           | Clear behavior                 |
| ---------------- | -------- | ------------------------------------ | ------------------------------------------------------ | ------------------------------ |
| `name`           | Yes      | Creates `crm_contacts.name`          | Present nonblank updates `name`; omitted/blank invalid | Not clearable                  |
| `email`          | Yes      | Creates normalized lowercase `email` | Upsert key only; omitted/blank invalid                 | Not clearable                  |
| `phone`          | No       | Creates `phone`, or `NULL` if blank  | Omitted preserves; present nonblank updates            | Present blank clears to `NULL` |
| `vertical`       | No       | Creates `vertical`, or `NULL`        | Omitted preserves; present nonblank updates            | Present blank clears to `NULL` |
| `follower_count` | No       | Creates count, or `NULL` if blank    | Omitted preserves; present nonblank updates            | Present blank clears to `NULL` |
| `instagram`      | No       | Creates/updates social account       | Omitted or blank preserves; present nonblank upserts   | Not clearable through import   |
| `tiktok`         | No       | Creates/updates social account       | Omitted or blank preserves; present nonblank upserts   | Not clearable through import   |
| `youtube`        | No       | Creates/updates social account       | Omitted or blank preserves; present nonblank upserts   | Not clearable through import   |
| `x`              | No       | Creates/updates social account       | Omitted or blank preserves; present nonblank upserts   | Not clearable through import   |
| `linkedin`       | No       | Creates/updates social account       | Omitted or blank preserves; present nonblank upserts   | Not clearable through import   |
| `notes`          | No       | Creates `notes`, or `NULL` if blank  | Omitted preserves; present nonblank updates            | Present blank clears to `NULL` |

Blank social handle cells do not delete `crm_contact_social_accounts` rows because imported handles are required to be non-empty.
