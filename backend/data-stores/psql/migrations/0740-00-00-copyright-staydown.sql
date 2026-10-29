-- DSM Article 17 staydown registry. A row exists only while the restriction a moderator confirmed is
-- in force; lifting the restriction deletes it. A match is an upload that looked like a registered
-- image and is shown to staff until a moderator marks it reviewed; it never blocks, hides or delays
-- the upload.

CREATE TABLE copyright_staydown_entries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_restriction_id uuid NOT NULL UNIQUE REFERENCES copyright_restrictions(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES retained_image_identities(id) ON DELETE RESTRICT,
  sha_256 bytea NOT NULL CHECK (octet_length(sha_256) = 32),
  perceptual_hash bit(64),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_copyright_staydown_entries__image ON copyright_staydown_entries (image_id);
CREATE INDEX idx_copyright_staydown_entries__sha_256 ON copyright_staydown_entries (sha_256);

CREATE TRIGGER trigger_copyright_staydown_entries_updated_at
  BEFORE UPDATE ON copyright_staydown_entries
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_staydown_matches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_staydown_entry_id uuid NOT NULL REFERENCES copyright_staydown_entries(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES retained_image_identities(id) ON DELETE RESTRICT,
  uploaded_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_kind copyright_staydown_match_kinds NOT NULL CHECK (match_kind IN ('exact', 'perceptual')),
  hamming_distance smallint NOT NULL CHECK (hamming_distance BETWEEN 0 AND 64),
  reviewed_at timestamptz,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT copyright_staydown_match_unique UNIQUE (copyright_staydown_entry_id, image_id, uploaded_by_id),
  CONSTRAINT copyright_staydown_match_exact_distance CHECK (match_kind <> 'exact' OR hamming_distance = 0),
  CONSTRAINT copyright_staydown_match_reviewer CHECK (reviewed_by_id IS NULL OR reviewed_at IS NOT NULL)
);

CREATE INDEX idx_copyright_staydown_matches__image ON copyright_staydown_matches (image_id);
CREATE INDEX idx_copyright_staydown_matches__uploaded_by ON copyright_staydown_matches (uploaded_by_id);
CREATE INDEX idx_copyright_staydown_matches__reviewed_by ON copyright_staydown_matches (reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;
CREATE INDEX idx_copyright_staydown_matches__open ON copyright_staydown_matches (copyright_staydown_entry_id) WHERE reviewed_at IS NULL;

CREATE TRIGGER trigger_copyright_staydown_matches_updated_at
  BEFORE UPDATE ON copyright_staydown_matches
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE copyright_staydown_entries IS 'Registry of media whose withholding a moderator confirmed, kept only while that restriction is in force. Written only when copyright.staydownMatching is on.';
COMMENT ON COLUMN copyright_staydown_entries.copyright_restriction_id IS 'The moderator-confirmed restriction this entry belongs to. Lifting the restriction deletes the entry.';
COMMENT ON COLUMN copyright_staydown_entries.image_id IS 'Retained identity of the confirmed image the hashes were taken from, even if its live row is deleted.';
COMMENT ON COLUMN copyright_staydown_entries.sha_256 IS 'SHA-256 of the original image bytes, for exact re-upload matching.';
COMMENT ON COLUMN copyright_staydown_entries.perceptual_hash IS '64-bit difference hash (dHash) of the image, for near-duplicate matching by Hamming distance. Null until the image worker computes it, or when the image is too flat to hash.';
COMMENT ON TABLE copyright_staydown_matches IS 'An upload that matched a staydown entry, shown to staff until a moderator marks it reviewed. Never blocks the upload. One row per entry, image and uploader, so a reviewed match is never reopened by a replay. Deleted with its entry when the restriction is lifted.';
COMMENT ON COLUMN copyright_staydown_matches.copyright_staydown_entry_id IS 'The registered image the upload matched; it leads to the case staff review.';
COMMENT ON COLUMN copyright_staydown_matches.image_id IS 'Retained identity of the matching image: the new upload for a perceptual match, or the existing image the upload deduplicated to for an exact match.';

-- Every producer of a staff or business blocker invalidates the case's paged retention proof.
-- A KEY SHARE case lock fences the sweep's FOR UPDATE without upgrading the FK lock held
-- by concurrent child inserts. The generation UPSERT serializes writers for one case.
CREATE FUNCTION fn_copyright_thread_blocker_case_id(source_table text, source_row jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE case_id uuid;
BEGIN
  IF source_row IS NULL THEN RETURN NULL; END IF;
  IF source_table = 'copyright_notices' THEN
    RETURN (source_row ->> 'id')::uuid;
  ELSIF source_table = 'copyright_notice_target_images' THEN
    SELECT target.copyright_notice_id INTO case_id FROM copyright_notice_targets target
    WHERE target.id = (source_row ->> 'copyright_notice_target_id')::uuid;
  ELSIF source_table IN (
    'copyright_notice_form_screenings', 'copyright_notice_form_screening_attempts',
    'copyright_notice_form_intake_reviews') THEN
    SELECT intake.copyright_notice_id INTO case_id FROM copyright_notice_form_intakes intake
    WHERE intake.id = (source_row ->> 'copyright_notice_form_intake_id')::uuid;
  ELSIF source_table = 'copyright_territorial_redress_decisions' THEN
    SELECT request.copyright_notice_id INTO case_id
    FROM copyright_territorial_redress_requests request
    WHERE request.id = (source_row ->> 'copyright_territorial_redress_request_id')::uuid;
  ELSIF source_table IN ('copyright_notice_appeal_reviews', 'copyright_notice_counter_notice_reviews') THEN
    SELECT submission.copyright_notice_id INTO case_id FROM copyright_notice_submissions submission
    WHERE submission.id = (source_row ->> 'copyright_notice_submission_id')::uuid;
  ELSIF source_table = 'copyright_staydown_entries' THEN
    SELECT restriction.copyright_notice_id INTO case_id FROM copyright_restrictions restriction
    WHERE restriction.id = (source_row ->> 'copyright_restriction_id')::uuid;
  ELSIF source_table = 'copyright_staydown_matches' THEN
    SELECT restriction.copyright_notice_id INTO case_id
    FROM copyright_staydown_entries entry
    JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
    WHERE entry.id = (source_row ->> 'copyright_staydown_entry_id')::uuid;
  ELSIF source_table = 'copyright_notice_email_intake_reviews' THEN
    SELECT link.copyright_notice_id INTO case_id
    FROM copyright_notice_email_intake_notice_links link
    WHERE link.copyright_notice_email_intake_id =
      (source_row ->> 'copyright_notice_email_intake_receipt_id')::uuid;
  ELSIF source_table = 'copyright_notice_delivery_recipients' THEN
    SELECT work_item.copyright_notice_id INTO case_id
    FROM copyright_notice_delivery_work_items work_item
    WHERE work_item.id = (source_row ->> 'copyright_notice_delivery_work_item_id')::uuid;
  ELSE
    case_id := (source_row ->> 'copyright_notice_id')::uuid;
  END IF;
  RETURN case_id;
END;
$$;

CREATE FUNCTION fn_update_copyright_thread_blocker_generation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE old_case_id uuid; new_case_id uuid; case_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_case_id := fn_copyright_thread_blocker_case_id(TG_TABLE_NAME, to_jsonb(OLD));
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_case_id := fn_copyright_thread_blocker_case_id(TG_TABLE_NAME, to_jsonb(NEW));
  END IF;
  FOR case_id IN
    SELECT DISTINCT candidate.id FROM unnest(ARRAY[old_case_id, new_case_id]) candidate(id)
    WHERE candidate.id IS NOT NULL ORDER BY candidate.id
  LOOP
    PERFORM 1 FROM copyright_notices WHERE id = case_id FOR KEY SHARE;
    IF FOUND THEN
      INSERT INTO copyright_notice_thread_blocker_generations
        (copyright_notice_id, generation) VALUES (case_id, 1)
      ON CONFLICT (copyright_notice_id) DO UPDATE SET
        generation = copyright_notice_thread_blocker_generations.generation + 1;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE source_table text;
BEGIN
  FOREACH source_table IN ARRAY ARRAY[
    'copyright_notices', 'copyright_notice_targets', 'copyright_notice_form_intakes',
    'copyright_territorial_notice_receipts', 'copyright_territorial_decisions',
    'copyright_territorial_redress_requests', 'copyright_restrictions',
    'copyright_notice_submissions', 'copyright_notice_submission_assessments',
    'copyright_notice_legal_hold_assessments', 'copyright_notice_legal_hold_resolutions',
    'copyright_notice_action_work_items', 'copyright_notice_deadlines',
    'copyright_notice_email_intake_notice_links', 'copyright_repeat_infringer_incidents',
    'copyright_notice_delivery_work_items', 'copyright_notice_guest_capabilities',
    'copyright_notice_email_correspondence_reviews',
    'copyright_notice_target_images', 'copyright_notice_form_screenings',
    'copyright_notice_form_screening_attempts', 'copyright_notice_form_intake_reviews',
    'copyright_territorial_redress_decisions', 'copyright_notice_appeal_reviews',
    'copyright_notice_counter_notice_reviews', 'copyright_staydown_entries',
    'copyright_staydown_matches', 'copyright_notice_email_intake_reviews',
    'copyright_notice_delivery_recipients'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trigger_copyright_thread_blocker_generation '
      || 'AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW '
      || 'EXECUTE FUNCTION fn_update_copyright_thread_blocker_generation()',
      source_table);
  END LOOP;
END;
$$;
COMMENT ON COLUMN copyright_staydown_matches.uploaded_by_id IS 'The user who uploaded the matching bytes.';
COMMENT ON COLUMN copyright_staydown_matches.match_kind IS 'exact (same SHA-256) or perceptual (dHash within the documented Hamming distance).';
COMMENT ON COLUMN copyright_staydown_matches.hamming_distance IS 'Bit difference between the two perceptual hashes; 0 for an exact match.';
COMMENT ON COLUMN copyright_staydown_matches.reviewed_at IS 'When a moderator marked the match reviewed; null while it waits in the staff queue.';
COMMENT ON COLUMN copyright_staydown_matches.reviewed_by_id IS 'The moderator who reviewed the match; null while unreviewed or once that account is erased.';
