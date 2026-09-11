# Stories reference

[Back to Stories](stories.md)

## Data Model

### `stories` table

| Column                      | Type                   | Description                                                           |
| --------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `id`                        | UUID (UUIDv7)          | Primary key                                                           |
| `title`                     | TEXT (1-500, nullable) | LLM-generated headline                                                |
| `cluster_reason`            | TEXT (nullable)        | LLM-generated explanation of why these articles were grouped together |
| `published_at`              | TIMESTAMPTZ (nullable) | When the event occurred (agent-determined)                            |
| `official_rss_feed_item_id` | UUID (nullable)        | FK to the canonical item                                              |
| `official_locked_at`        | TIMESTAMPTZ (nullable) | Set by admin to prevent agent override                                |

### `post__stories` junction table

Links one story post to one story. Replaces the former `stories.discussion_post_id` column.

| Column            | Type          | Description                                  |
| ----------------- | ------------- | -------------------------------------------- |
| `post_id`         | UUID (PK)     | FK to posts.id                               |
| `story_id`        | UUID (unique) | FK to stories.id (one post per story)        |
| `initiated_by_id` | UUID          | FK to users.id (user who triggered creation) |
| `created_at`      | TIMESTAMPTZ   | When the link was created                    |

### `posts.ai_summary_markdown` column

AI-generated summary field on the `posts` table. Separate from user-authored `markdown`. Agents update this field via `updatePost()` (except `topic_recommendation` posts, which use dedicated workflows). Story posts use this field exclusively (no user-authored markdown).

### Columns on `rss_feed_items`

| Column            | Type                   | Description                            |
| ----------------- | ---------------------- | -------------------------------------- |
| `story_id`        | UUID (nullable)        | FK to stories, ON DELETE SET NULL      |
| `story_locked_at` | TIMESTAMPTZ (nullable) | Set by admin, prevents auto-clustering |
