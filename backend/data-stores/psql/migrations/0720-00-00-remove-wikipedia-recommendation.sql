-- Retire the automated Wikipedia recommender without removing the generic topic-recommendation
-- workflow. The retired system user is anonymized instead of hard-deleted so unrelated audit
-- foreign keys cannot cascade or block this migration.

WITH retired_user AS (
  SELECT id
  FROM users
  WHERE username = 'wikipedia-recommender'
    AND is_system = TRUE
)
DELETE FROM posts
USING retired_user
WHERE posts.created_by_id = retired_user.id
  AND posts.post_type = 'topic_recommendation';

WITH retired_user AS (
  SELECT id
  FROM users
  WHERE username = 'wikipedia-recommender'
    AND is_system = TRUE
)
DELETE FROM agents
USING retired_user
WHERE agents.system_user_id = retired_user.id
  AND agents.agent_type = 'recommender';

UPDATE users
SET username = NULL,
    deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE username = 'wikipedia-recommender'
  AND is_system = TRUE;

-- Fixed migrations run before versioned views. Drop the only dependent view so the column can be
-- removed; the view runner recreates it from 2026-03-03-posts.sql later in the same db:migrate.
DROP VIEW IF EXISTS view_posts;

ALTER TABLE post_topic_recommendations
  DROP COLUMN topic_wikipedia_pageid;

COMMENT ON TABLE post_topic_recommendations IS
  'User- and admin-created topic recommendations attached to posts, pending admin review. Range-partitioned by post_id.';

ALTER TYPE agent_types RENAME TO agent_types_with_retired_recommender;
CREATE TYPE agent_types AS ENUM ('moderator', 'autotagger', 'storyteller');
ALTER TABLE agents
  ALTER COLUMN agent_type TYPE agent_types
  USING agent_type::text::agent_types;
DROP TYPE agent_types_with_retired_recommender;
