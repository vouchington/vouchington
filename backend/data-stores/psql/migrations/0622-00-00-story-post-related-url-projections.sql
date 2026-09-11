-- Durable, generation-fenced exact projection of active story RSS URLs onto story posts.
CREATE TABLE IF NOT EXISTS story_post_related_url_projection_jobs (
  post_id UUID PRIMARY KEY,
  story_id UUID NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  source_high_water_id UUID,
  relation_high_water_id UUID,
  relation_snapshot_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  source_cursor_id UUID,
  source_completed_at TIMESTAMPTZ,
  prune_cursor_id UUID,
  invalidation_required_at TIMESTAMPTZ,
  invalidation_completed_at TIMESTAMPTZ,
  lease_token UUID,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  last_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((lease_token IS NULL) = (leased_at IS NULL)),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (
    invalidation_completed_at IS NULL OR
    invalidation_required_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_story_post_url_proj_jobs__lease_expires_at_post_id
  ON story_post_related_url_projection_jobs (lease_expires_at, post_id);
CREATE INDEX IF NOT EXISTS idx_story_post_url_proj_jobs__last_claimed_at_post_id
  ON story_post_related_url_projection_jobs (last_claimed_at ASC NULLS FIRST, post_id);
CREATE INDEX IF NOT EXISTS idx_story_post_related_url_projection_jobs__story_id
  ON story_post_related_url_projection_jobs (story_id);

CREATE TABLE IF NOT EXISTS story_post_related_url_projection_receipts (
  post_id UUID NOT NULL,
  generation BIGINT NOT NULL,
  url_id UUID NOT NULL,
  source_item_id UUID NOT NULL,
  eligible BOOLEAN NOT NULL,
  crawl_required BOOLEAN,
  relation_written_at TIMESTAMPTZ,
  effects_dispatched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, generation, url_id),
  -- The work generation is deliberately mutable when a source mutation restarts.
  -- Referencing only the stable post row lets the leased worker clean stale generations in pages.
  FOREIGN KEY (post_id)
    REFERENCES story_post_related_url_projection_jobs (post_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS story_post_related_url_projection_relation_mutations (
  post_id UUID NOT NULL REFERENCES story_post_related_url_projection_jobs (post_id) ON DELETE CASCADE,
  generation BIGINT NOT NULL,
  relation_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, generation, relation_id)
);

CREATE OR REPLACE FUNCTION fn_record_story_post_related_url_projection_relation_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL OR
    current_setting('voucha.story_post_related_url_projection_write', true) = 'true' THEN
    RETURN NEW;
  END IF;

  INSERT INTO story_post_related_url_projection_relation_mutations (post_id, generation, relation_id)
  SELECT work.post_id, work.generation, NEW.id
  FROM story_post_related_url_projection_jobs work
  WHERE work.post_id = NEW.subject_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_story_post_related_url_projection_receipts__url_id
  ON story_post_related_url_projection_receipts (url_id);
CREATE INDEX IF NOT EXISTS idx_story_post_related_url_projection_receipts__source_item_id
  ON story_post_related_url_projection_receipts (source_item_id);

ALTER TABLE story_post_related_url_projection_jobs
  ADD CONSTRAINT story_post_related_url_projection_jobs_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE story_post_related_url_projection_jobs
  VALIDATE CONSTRAINT story_post_related_url_projection_jobs_post_id_fkey;
ALTER TABLE story_post_related_url_projection_jobs
  ADD CONSTRAINT story_post_related_url_projection_jobs_story_id_fkey
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE story_post_related_url_projection_jobs
  VALIDATE CONSTRAINT story_post_related_url_projection_jobs_story_id_fkey;
ALTER TABLE story_post_related_url_projection_receipts
  ADD CONSTRAINT story_post_related_url_projection_receipts_url_id_fkey
  FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE story_post_related_url_projection_receipts
  VALIDATE CONSTRAINT story_post_related_url_projection_receipts_url_id_fkey;
ALTER TABLE story_post_related_url_projection_receipts
  ADD CONSTRAINT story_post_related_url_projection_receipts_source_item_id_fkey
  FOREIGN KEY (source_item_id) REFERENCES rss_feed_items(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE story_post_related_url_projection_receipts
  VALIDATE CONSTRAINT story_post_related_url_projection_receipts_source_item_id_fkey;
CREATE TRIGGER trigger_story_post_related_url_projection_jobs_updated_at
BEFORE UPDATE ON story_post_related_url_projection_jobs
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trigger_story_post_related_url_projection_receipts_updated_at
BEFORE UPDATE ON story_post_related_url_projection_receipts
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trigger_story_post_relation_mutations_updated_at
BEFORE UPDATE ON story_post_related_url_projection_relation_mutations
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE story_post_related_url_projection_jobs IS 'Durable, generation-fenced jobs that project one story snapshot onto each story post.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.post_id IS 'Story post receiving the projected related URL relations.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.story_id IS 'Current story whose active RSS item URLs are projected.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.generation IS 'Monotonic source snapshot generation; stale workers cannot mutate a newer generation.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.source_high_water_id IS 'RSS item ID high-water mark that bounds this generation source snapshot.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.relation_high_water_id IS 'Relation ID high-water mark that excludes post-capture related links from this generation prune.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.relation_snapshot_at IS 'Wall-clock boundary that excludes relations reactivated after this generation was captured.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.source_cursor_id IS 'RSS item ID keyset cursor for the bounded source projection phase.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.source_completed_at IS 'Time the bounded source projection phase reached its high-water mark.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.prune_cursor_id IS 'Relation ID keyset cursor for the stale-relation pruning phase.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.invalidation_required_at IS 'Time a committed relation mutation made the story cache invalidation due.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.invalidation_completed_at IS 'Time the required story cache invalidation completed for this generation.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.lease_token IS 'Opaque fencing token rotated for each worker lease claim.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.leased_at IS 'Time the current worker lease was claimed.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.lease_expires_at IS 'Deadline after which a different worker may claim the job.';
COMMENT ON COLUMN story_post_related_url_projection_jobs.last_claimed_at IS 'Time the durable fairness marker was last updated, including retries after lease expiry.';
COMMENT ON TABLE story_post_related_url_projection_receipts IS 'Per-generation URL decisions and durable effect receipts for story related URL projection.';
COMMENT ON TABLE story_post_related_url_projection_relation_mutations IS 'Post-capture active related URL confirmations that this projection generation must not prune.';
COMMENT ON COLUMN story_post_related_url_projection_relation_mutations.post_id IS 'Story post whose active related URL relation was confirmed after projection capture.';
COMMENT ON COLUMN story_post_related_url_projection_relation_mutations.generation IS 'Exact projection generation that observed the post-capture relation confirmation.';
COMMENT ON COLUMN story_post_related_url_projection_relation_mutations.relation_id IS 'Active related URL relation protected from pruning by this projection generation.';
COMMENT ON COLUMN story_post_related_url_projection_relation_mutations.updated_at IS 'Time this generation-scoped relation mutation fence was last updated.';
COMMENT ON COLUMN story_post_related_url_projection_receipts.post_id IS 'Story post owning this projection receipt.';
COMMENT ON COLUMN story_post_related_url_projection_receipts.generation IS 'Projection generation that owns this receipt.';
COMMENT ON COLUMN story_post_related_url_projection_receipts.url_id IS 'Candidate URL evaluated for projection.';
COMMENT ON COLUMN story_post_related_url_projection_receipts.source_item_id IS 'RSS feed item that supplied the candidate URL.';
COMMENT ON COLUMN story_post_related_url_projection_receipts.eligible IS 'Whether pre-write safety screening admitted this URL for projection.';
COMMENT ON COLUMN story_post_related_url_projection_receipts.crawl_required IS 'Whether activating this URL relation requires one durable post-commit crawl dispatch; NULL means the relation write has not yet decided.';
COMMENT ON COLUMN story_post_related_url_projection_receipts.relation_written_at IS 'Time the related URL relation write committed.';
COMMENT ON COLUMN story_post_related_url_projection_receipts.effects_dispatched_at IS 'Time the post-commit crawl dispatch completed.';
