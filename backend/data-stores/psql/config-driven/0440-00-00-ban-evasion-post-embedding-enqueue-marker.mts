export default () => `
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS ban_evasion_post_embedding_input_sha256 BYTEA;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'posts_ban_evasion_post_embedding_input_sha256_length'
      AND conrelid = 'posts'::regclass
  ) THEN
    ALTER TABLE posts
    ADD CONSTRAINT posts_ban_evasion_post_embedding_input_sha256_length
    CHECK (
      ban_evasion_post_embedding_input_sha256 IS NULL
      OR OCTET_LENGTH(ban_evasion_post_embedding_input_sha256) = 32
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts__ban_evasion_post_embedding_pending
ON posts (id)
WHERE community_id IS NOT NULL
  AND created_by_id IS NOT NULL
  AND deleted_at IS NULL
  AND bedrock_nova_multimodal_v1_embedding IS NOT NULL
  AND bedrock_nova_multimodal_v1_embedding_created_at IS NOT NULL
  AND bedrock_nova_multimodal_v1_input_sha256 = bedrock_nova_multimodal_v1_content_sha256
  AND (
    ban_evasion_post_embedding_input_sha256 IS NULL
    OR ban_evasion_post_embedding_input_sha256 != bedrock_nova_multimodal_v1_input_sha256
  );

COMMENT ON COLUMN posts.ban_evasion_post_embedding_input_sha256 IS
'Post embedding input SHA for which the post-embedding ban-evasion follow-up enqueue has been recorded.';
`
