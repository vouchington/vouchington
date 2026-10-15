-- Operator pause state for each domain that runs in the shared `background` queue. A row appears
-- the first time an operator pauses a domain; resuming clears the pause columns and keeps the row.
-- No row means the domain runs. Workers read this before each job; pause history is in
-- moderator_actions.
CREATE TABLE queue_domain_controls (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  domain text NOT NULL UNIQUE CHECK (domain ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'),
  paused_at timestamptz,
  paused_by_user_id uuid,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (paused_at IS NOT NULL OR (paused_by_user_id IS NULL AND reason IS NULL))
);

CREATE INDEX idx_queue_domain_controls__paused_by_user_id
  ON queue_domain_controls (paused_by_user_id) WHERE paused_by_user_id IS NOT NULL;
CREATE TRIGGER trigger_queue_domain_controls_updated_at
  BEFORE UPDATE ON queue_domain_controls
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

ALTER TABLE queue_domain_controls
  ADD CONSTRAINT fk_queue_domain_controls__paused_by_user_id
  FOREIGN KEY (paused_by_user_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE queue_domain_controls
  VALIDATE CONSTRAINT fk_queue_domain_controls__paused_by_user_id;

COMMENT ON TABLE queue_domain_controls IS 'Operator pause state of each background-queue domain. A missing row or a null paused_at means the domain runs.';
COMMENT ON COLUMN queue_domain_controls.id IS 'Surrogate identifier; the domain is the natural key.';
COMMENT ON COLUMN queue_domain_controls.domain IS 'Background-queue domain identifier from the application registry, lowercase words joined by hyphens.';
COMMENT ON COLUMN queue_domain_controls.paused_at IS 'When the operator paused the domain. Null while the domain runs.';
COMMENT ON COLUMN queue_domain_controls.paused_by_user_id IS 'Staff user who paused the domain. Null while running, or after that user was deleted.';
COMMENT ON COLUMN queue_domain_controls.reason IS 'Operator note explaining the pause. Null while running or when no note was given.';
COMMENT ON COLUMN queue_domain_controls.created_at IS 'When the domain was first paused.';
COMMENT ON COLUMN queue_domain_controls.updated_at IS 'Last pause or resume. Maintained by trigger.';
