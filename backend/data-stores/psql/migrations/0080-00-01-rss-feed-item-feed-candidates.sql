-- Current read projections, not history. Every item-owned row cascades with its live item.
CREATE TABLE IF NOT EXISTS rss_feed_item_feed_candidates (
  id UUID PRIMARY KEY REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  story_id UUID,
  sort_at TIMESTAMPTZ NOT NULL,
  is_official_for_story BOOLEAN NOT NULL DEFAULT FALSE,
  votes_score_sort DOUBLE PRECISION NOT NULL,
  votes_score_net DOUBLE PRECISION NOT NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_feed_candidates__story_priority
  ON rss_feed_item_feed_candidates (story_id, is_official_for_story DESC, votes_score_sort DESC, id DESC)
  WHERE story_id IS NOT NULL AND votes_score_net > 0 AND deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS rss_feed_item_topic_candidates (
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  sort_at TIMESTAMPTZ,
  membership_count BIGINT NOT NULL CHECK (membership_count > 0),
  PRIMARY KEY (rss_feed_item_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_topic_candidates__topic_order
  ON rss_feed_item_topic_candidates (topic_id, sort_at DESC, rss_feed_item_id DESC)
  WHERE sort_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS rss_feed_item_topic_alias_candidates (
  topic_alias_id UUID NOT NULL REFERENCES topic_aliases(id) ON DELETE CASCADE,
  rss_feed_item_id UUID NOT NULL REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  PRIMARY KEY (topic_alias_id, rss_feed_item_id)
);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_topic_alias_candidates__item
  ON rss_feed_item_topic_alias_candidates (rss_feed_item_id, topic_alias_id);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_topic_alias_candidates__topic
  ON rss_feed_item_topic_alias_candidates (topic_id) WHERE topic_id IS NOT NULL;

DO $$ BEGIN
  CREATE TYPE rss_feed_item_candidate_reconciliation_phases AS ENUM ('sources', 'topics');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS rss_feed_item_candidate_reconciliations (
  rss_feed_item_id UUID PRIMARY KEY REFERENCES rss_feed_items(id) ON DELETE CASCADE,
  generation BIGINT NOT NULL DEFAULT 1,
  phase rss_feed_item_candidate_reconciliation_phases NOT NULL DEFAULT 'sources',
  cursor_feed_id UUID,
  cursor_topic_id UUID
);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_sources__item_sort
  ON rss_feed_item_sources (rss_feed_id, item_sort_at DESC, rss_feed_item_id DESC)
  WHERE item_sort_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rss_feeds__live_activity_lookup
  ON rss_feeds (id) INCLUDE (latest_item_sort_at)
  WHERE is_enabled AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION fn_update_rss_feed_item_topic_candidate_count(
  item_id UUID, target_topic_id UUID, delta INTEGER
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE current_count BIGINT;
BEGIN
  IF item_id IS NULL OR target_topic_id IS NULL THEN RETURN; END IF;
  IF delta = 1 THEN
    INSERT INTO rss_feed_item_topic_candidates (rss_feed_item_id, topic_id, sort_at, membership_count)
    SELECT id, target_topic_id, CASE WHEN deleted_at IS NULL THEN published_at END, 1
    FROM rss_feed_items WHERE id = item_id
    ON CONFLICT (rss_feed_item_id, topic_id) DO UPDATE
      SET membership_count = rss_feed_item_topic_candidates.membership_count + 1;
  ELSE
    SELECT membership_count INTO current_count FROM rss_feed_item_topic_candidates
      WHERE rss_feed_item_id = item_id AND topic_id = target_topic_id FOR UPDATE;
    IF current_count = 1 THEN
      DELETE FROM rss_feed_item_topic_candidates
        WHERE rss_feed_item_id = item_id AND topic_id = target_topic_id;
    ELSIF current_count > 1 THEN
      UPDATE rss_feed_item_topic_candidates SET membership_count = membership_count - 1
        WHERE rss_feed_item_id = item_id AND topic_id = target_topic_id;
    END IF;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION fn_update_rss_feed_item_topic_candidate_memberships(
  old_item UUID, old_topic UUID, new_item UUID, new_topic UUID
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE change RECORD;
BEGIN
  IF old_item IS NOT DISTINCT FROM new_item AND old_topic IS NOT DISTINCT FROM new_topic THEN RETURN; END IF;
  -- Exactly two contribution keys; deterministic order also covers topic moves.
  FOR change IN SELECT * FROM (VALUES (old_item, old_topic, -1), (new_item, new_topic, 1))
      AS changes(item_id, topic_id, delta) WHERE topic_id IS NOT NULL ORDER BY item_id, topic_id
  LOOP
    PERFORM fn_update_rss_feed_item_topic_candidate_count(change.item_id, change.topic_id, change.delta);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION fn_project_rss_feed_category_candidates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_update_rss_feed_item_topic_candidate_memberships(
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.rss_feed_item_id END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.topic_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.rss_feed_item_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.topic_id END);
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trigger_rss_feed_category_candidates
  AFTER INSERT OR UPDATE OF topic_id, rss_feed_item_id OR DELETE ON rss_feed_item_categories
  FOR EACH ROW EXECUTE FUNCTION fn_project_rss_feed_category_candidates();


CREATE OR REPLACE TRIGGER trigger_rss_feed_alias_candidate_memberships
  AFTER INSERT OR UPDATE OF topic_id, rss_feed_item_id OR DELETE ON rss_feed_item_topic_alias_candidates
  FOR EACH ROW EXECUTE FUNCTION fn_project_rss_feed_category_candidates();

CREATE OR REPLACE FUNCTION fn_update_rss_feed_source_item_sort()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Read the canonical row: its AFTER projection trigger may still be queued in a data-modifying CTE.
  SELECT CASE WHEN deleted_at IS NULL THEN published_at END INTO NEW.item_sort_at
    FROM rss_feed_items WHERE id = NEW.rss_feed_item_id;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trigger_rss_feed_source_item_sort
  BEFORE INSERT OR UPDATE OF item_sort_at, rss_feed_item_id ON rss_feed_item_sources
  FOR EACH ROW EXECUTE FUNCTION fn_update_rss_feed_source_item_sort();
CREATE OR REPLACE FUNCTION fn_update_rss_feed_latest_item_sort()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE feed_id UUID; latest_sort TIMESTAMPTZ;
BEGIN
  -- At most the old and new feed; no follower rows are touched.
  FOR feed_id IN SELECT DISTINCT value FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.rss_feed_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.rss_feed_id END
  ]) AS ids(value) WHERE value IS NOT NULL ORDER BY value
  LOOP
    -- Serialize before taking the source snapshot, including concurrent first inserts.
    PERFORM 1 FROM rss_feeds WHERE id = feed_id FOR NO KEY UPDATE;
    SELECT item_sort_at INTO latest_sort FROM rss_feed_item_sources
      WHERE rss_feed_id = feed_id AND item_sort_at IS NOT NULL
      ORDER BY item_sort_at DESC, rss_feed_item_id DESC LIMIT 1;
    UPDATE rss_feeds SET latest_item_sort_at = latest_sort
      WHERE id = feed_id AND latest_item_sort_at IS DISTINCT FROM latest_sort;
  END LOOP;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trigger_rss_feed_latest_item_sort
  AFTER INSERT OR UPDATE OF item_sort_at, rss_feed_id OR DELETE ON rss_feed_item_sources
  FOR EACH ROW EXECUTE FUNCTION fn_update_rss_feed_latest_item_sort();

CREATE OR REPLACE FUNCTION fn_project_rss_feed_item_feed_candidate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE official BOOLEAN := FALSE;
BEGIN
  IF NEW.story_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM stories WHERE id = NEW.story_id
      AND official_rss_feed_item_id = NEW.id AND deleted_at IS NULL) INTO official;
  END IF;
  INSERT INTO rss_feed_item_feed_candidates
    (id, story_id, sort_at, is_official_for_story, votes_score_sort, votes_score_net, deleted_at)
  VALUES (NEW.id, NEW.story_id, NEW.published_at, official,
    COALESCE(NEW.votes_score_sort, 0), COALESCE(NEW.votes_score_net, 0), NEW.deleted_at)
  ON CONFLICT (id) DO UPDATE SET story_id = EXCLUDED.story_id, sort_at = EXCLUDED.sort_at,
    is_official_for_story = EXCLUDED.is_official_for_story,
    votes_score_sort = EXCLUDED.votes_score_sort, votes_score_net = EXCLUDED.votes_score_net,
    deleted_at = EXCLUDED.deleted_at;
  IF TG_OP = 'UPDATE' AND (OLD.published_at IS DISTINCT FROM NEW.published_at
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
    INSERT INTO rss_feed_item_candidate_reconciliations (rss_feed_item_id) VALUES (NEW.id)
    ON CONFLICT (rss_feed_item_id) DO UPDATE SET
      generation = rss_feed_item_candidate_reconciliations.generation + 1,
      phase = 'sources', cursor_feed_id = NULL, cursor_topic_id = NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER trigger_rss_feed_item_feed_candidate
  AFTER INSERT OR UPDATE OF data, story_id, votes_score_up, votes_score_none, votes_score_down, deleted_at
  ON rss_feed_items FOR EACH ROW EXECUTE FUNCTION fn_project_rss_feed_item_feed_candidate();

CREATE OR REPLACE FUNCTION fn_project_story_official_feed_candidates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE item_id UUID;
BEGIN
  -- Only the old and new official item can change priority; never scan a story's members.
  FOR item_id IN SELECT DISTINCT value FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.official_rss_feed_item_id END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.official_rss_feed_item_id END
  ]) AS ids(value) WHERE value IS NOT NULL ORDER BY value
  LOOP
    UPDATE rss_feed_item_feed_candidates SET is_official_for_story = COALESCE(
      (TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL AND id = NEW.official_rss_feed_item_id
        AND story_id = NEW.id), FALSE)
      WHERE id = item_id;
  END LOOP;
  RETURN NULL;
END $$;

COMMENT ON TABLE rss_feed_item_feed_candidates IS 'Current item order and story-priority projection; one row per live item identity and cascading item deletion, not event history.';
COMMENT ON COLUMN rss_feed_item_feed_candidates.id IS 'Live RSS item identity; foreign key cascades on item deletion.';
COMMENT ON COLUMN rss_feed_item_feed_candidates.story_id IS 'Current story membership; the story foreign key is installed with its canonical creator.';
COMMENT ON COLUMN rss_feed_item_feed_candidates.sort_at IS 'Current canonical publication order copied from the item.';
COMMENT ON COLUMN rss_feed_item_feed_candidates.is_official_for_story IS 'Current official pointer membership, refreshed by bounded old/new-item updates.';
COMMENT ON COLUMN rss_feed_item_feed_candidates.votes_score_sort IS 'Current Wilson ranking score; story children rank by this score.';
COMMENT ON COLUMN rss_feed_item_feed_candidates.votes_score_net IS 'Current net score; only positive rows participate in story child reads.';
COMMENT ON COLUMN rss_feed_item_feed_candidates.deleted_at IS 'Current item deletion marker; excluded by the priority index.';

COMMENT ON TABLE rss_feed_item_topic_candidates IS 'Current topic-to-item membership projection coalescing RSS categories and positive voted relations; deleted when the last contribution disappears.';
COMMENT ON COLUMN rss_feed_item_topic_candidates.rss_feed_item_id IS 'Live item foreign key; item deletion cascades.';
COMMENT ON COLUMN rss_feed_item_topic_candidates.topic_id IS 'Current matched topic; topic deletion cascades.';
COMMENT ON COLUMN rss_feed_item_topic_candidates.sort_at IS 'Projected canonical item publication time; hidden items have no sortable timestamp.';
COMMENT ON COLUMN rss_feed_item_topic_candidates.membership_count IS 'Positive count of current category, topic-relation and alias-relation contributions.';

COMMENT ON TABLE rss_feed_item_topic_alias_candidates IS 'Current positive alias-relation contribution, including unlinked aliases for bounded ownership reconciliation.';
COMMENT ON COLUMN rss_feed_item_topic_alias_candidates.topic_alias_id IS 'Current voted alias; alias deletion cascades.';
COMMENT ON COLUMN rss_feed_item_topic_alias_candidates.rss_feed_item_id IS 'Current relation subject; item deletion cascades.';
COMMENT ON COLUMN rss_feed_item_topic_alias_candidates.topic_id IS 'Last projected alias owner; NULL for an unlinked alias.';

COMMENT ON TABLE rss_feed_item_candidate_reconciliations IS 'Coalesced pending canonical-date/deletion projection fanout. Bounded source/topic pages advance transactionally and completion deletes the row.';
COMMENT ON COLUMN rss_feed_item_candidate_reconciliations.rss_feed_item_id IS 'Live item needing projection fanout; item deletion cascades.';
COMMENT ON COLUMN rss_feed_item_candidate_reconciliations.generation IS 'Monotonic signal generation; new item changes reset both page cursors.';
COMMENT ON COLUMN rss_feed_item_candidate_reconciliations.phase IS 'Current bounded association stream.';
COMMENT ON COLUMN rss_feed_item_candidate_reconciliations.cursor_feed_id IS 'Opaque last source key scanned; may outlive a removed feed.';
COMMENT ON COLUMN rss_feed_item_candidate_reconciliations.cursor_topic_id IS 'Opaque last topic key scanned; may outlive a removed topic.';

CREATE INDEX IF NOT EXISTS idx_rss_feed_item_topic_candidates__topic
  ON rss_feed_item_topic_candidates (topic_id, rss_feed_item_id);
CREATE INDEX IF NOT EXISTS idx_rss_feed_item_feed_candidates__story
  ON rss_feed_item_feed_candidates (story_id, id) WHERE story_id IS NOT NULL;
