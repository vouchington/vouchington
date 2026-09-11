# Moderation Flows reference

[Back to Moderation Flows](MODERATION-FLOWS.md)

## 2. Spam Detection

**Trigger:** Post created or content updated (entity listener).

**Signals (`backend/services/spam-detection/spam-signals.mts`):**

| Signal                   | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| Excessive links          | >5 links or link-to-text ratio >0.3                  |
| Spam keywords            | Crypto, pharma, SEO keyword patterns                 |
| Content hash duplicate   | Same content already posted by another user          |
| Embedding similarity     | pgvector cosine similarity for near-duplicates       |
| Referral/affiliate links | Detected referral link patterns                      |
| Low quality text         | Excessive caps, repetition, short content with links |

**Database:** `posts.spam_detection_flagged`, `posts.spam_detection_score`, `posts.spam_detection_results`, `posts.spam_detection_created_at`

**Services:** `backend/services/spam-detection/`

## 3. OpenAI Omni Moderation

**Trigger:** Post created or content updated (entity listener).

**Processing (`backend/services/openai-moderation/posts.mts`):**

- Uses `omni-moderation-latest` model (text + images)
- Content SHA256 deduplication — skips if content unchanged
- Results stored directly on the `posts` row
- Flagged posts: `posts.openai_omni_moderation_flagged = true` (hidden from search for non-owner/non-admin)

**Images:** Flagged images are **automatically deleted** (`backend/services/openai-moderation/images.mts`)

**Queue:** `openai_moderation_omni_single` (concurrency 5, rate limit 10/sec)

**Database:** `posts.openai_omni_moderation_flagged`, `posts.openai_omni_moderation_results`, `posts.openai_omni_moderation_created_at`, `images.openai_omni_moderation_*`

**Services:** `backend/services/openai-moderation/`, `backend/queues/openai-moderation/`

**Audit:** Flagged image auto-removal records a `moderator_actions.remove` row attributed to `automod`.
