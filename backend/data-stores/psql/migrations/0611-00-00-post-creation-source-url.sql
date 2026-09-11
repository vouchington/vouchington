ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS creation_source_url_id UUID;

ALTER TABLE posts
  ADD CONSTRAINT posts_creation_source_url_id_fkey
  FOREIGN KEY (creation_source_url_id) REFERENCES urls(id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE posts
  ADD CONSTRAINT posts_creation_source_url_id_check
  CHECK (creation_source_url_id IS NULL OR post_type = 'link')
  NOT VALID;

ALTER TABLE posts
  VALIDATE CONSTRAINT posts_creation_source_url_id_fkey;

ALTER TABLE posts
  VALIDATE CONSTRAINT posts_creation_source_url_id_check;

CREATE INDEX IF NOT EXISTS idx_posts__creation_source_url_id
  ON posts (creation_source_url_id)
  WHERE creation_source_url_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_prevent_post_creation_source_url_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.creation_source_url_id IS DISTINCT FROM OLD.creation_source_url_id THEN
    RAISE EXCEPTION 'post creation source URL is immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER posts_creation_source_url_id_immutable
  BEFORE UPDATE OF creation_source_url_id ON posts
  FOR EACH ROW EXECUTE FUNCTION fn_prevent_post_creation_source_url_update();

COMMENT ON COLUMN posts.creation_source_url_id IS 'Immutable raw URL submitted when creating a link post; NULL for existing URL records and rows written before immutable provenance.';
