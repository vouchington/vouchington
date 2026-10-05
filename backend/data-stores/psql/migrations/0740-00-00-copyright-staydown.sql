-- DSM Article 17 staydown registry. A row exists only while the restriction a moderator confirmed is
-- in force; lifting the restriction deletes it. A match is an upload that looked like a registered
-- image and is shown to staff until a moderator marks it reviewed; it never blocks, hides or delays
-- the upload.

CREATE TABLE copyright_staydown_entries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_restriction_id uuid NOT NULL UNIQUE REFERENCES copyright_restrictions(id) ON DELETE CASCADE,
  image_id uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
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
  image_id uuid NOT NULL REFERENCES images(id) ON DELETE CASCADE,
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
COMMENT ON COLUMN copyright_staydown_entries.image_id IS 'The confirmed image the hashes were taken from.';
COMMENT ON COLUMN copyright_staydown_entries.sha_256 IS 'SHA-256 of the original image bytes, for exact re-upload matching.';
COMMENT ON COLUMN copyright_staydown_entries.perceptual_hash IS '64-bit difference hash (dHash) of the image, for near-duplicate matching by Hamming distance. Null until the image worker computes it, or when the image is too flat to hash.';
COMMENT ON TABLE copyright_staydown_matches IS 'An upload that matched a staydown entry, shown to staff until a moderator marks it reviewed. Never blocks the upload. One row per entry, image and uploader, so a reviewed match is never reopened by a replay. Deleted with its entry when the restriction is lifted.';
COMMENT ON COLUMN copyright_staydown_matches.copyright_staydown_entry_id IS 'The registered image the upload matched; it leads to the case staff review.';
COMMENT ON COLUMN copyright_staydown_matches.image_id IS 'The matching image: the new upload for a perceptual match, or the existing image the upload deduplicated to for an exact match.';
COMMENT ON COLUMN copyright_staydown_matches.uploaded_by_id IS 'The user who uploaded the matching bytes.';
COMMENT ON COLUMN copyright_staydown_matches.match_kind IS 'exact (same SHA-256) or perceptual (dHash within the documented Hamming distance).';
COMMENT ON COLUMN copyright_staydown_matches.hamming_distance IS 'Bit difference between the two perceptual hashes; 0 for an exact match.';
COMMENT ON COLUMN copyright_staydown_matches.reviewed_at IS 'When a moderator marked the match reviewed; null while it waits in the staff queue.';
COMMENT ON COLUMN copyright_staydown_matches.reviewed_by_id IS 'The moderator who reviewed the match; null while unreviewed or once that account is erased.';
