-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS activitypub_inbox_delivery_storage_counters (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE,
  retained_rows BIGINT NOT NULL,
  retained_raw_body_bytes BIGINT NOT NULL,
  unverified_rows BIGINT NOT NULL,
  unverified_raw_body_bytes BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT activitypub_inbox_delivery_storage_counters__is_singleton CHECK (is_singleton),
  CONSTRAINT activitypub_inbox_delivery_storage_counters__nonnegative CHECK (
    retained_rows >= 0
    AND retained_raw_body_bytes >= 0
    AND unverified_rows >= 0
    AND unverified_raw_body_bytes >= 0
  )
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trg_activitypub_inbox_delivery_storage_counters__updated_at
BEFORE UPDATE ON activitypub_inbox_delivery_storage_counters
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

INSERT INTO activitypub_inbox_delivery_storage_counters (
  is_singleton,
  retained_rows,
  retained_raw_body_bytes,
  unverified_rows,
  unverified_raw_body_bytes
)
VALUES (TRUE, 0, 0, 0, 0);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_project_activitypub_inbox_delivery_storage_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  retained_rows_delta BIGINT;
  retained_bytes_delta BIGINT;
  unverified_rows_delta BIGINT;
  unverified_bytes_delta BIGINT;
  counters activitypub_inbox_delivery_storage_counters%ROWTYPE;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(OCTET_LENGTH(raw_body)), 0),
         COUNT(*) FILTER (WHERE verified_at IS NULL),
         COALESCE(SUM(OCTET_LENGTH(raw_body)) FILTER (WHERE verified_at IS NULL), 0)
  INTO retained_rows_delta, retained_bytes_delta, unverified_rows_delta, unverified_bytes_delta
  FROM inserted_deliveries;

  UPDATE activitypub_inbox_delivery_storage_counters
  SET retained_rows = retained_rows + retained_rows_delta,
      retained_raw_body_bytes = retained_raw_body_bytes + retained_bytes_delta,
      unverified_rows = unverified_rows + unverified_rows_delta,
      unverified_raw_body_bytes = unverified_raw_body_bytes + unverified_bytes_delta
  WHERE is_singleton
    AND (unverified_rows_delta <= 0 OR unverified_rows + unverified_rows_delta <= 10000)
    AND (
      unverified_bytes_delta <= 0
      OR unverified_raw_body_bytes + unverified_bytes_delta <= 268435456
    )
  RETURNING * INTO counters;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO counters
  FROM activitypub_inbox_delivery_storage_counters
  WHERE is_singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ActivityPub inbox storage counter singleton is missing';
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    CONSTRAINT = 'activitypub_inbox_delivery_work_items_unverified_capacity',
    MESSAGE = 'ActivityPub inbox unverified storage capacity exceeded',
    DETAIL = json_build_object(
      'unverifiedRows', counters.unverified_rows,
      'unverifiedRawBodyBytes', counters.unverified_raw_body_bytes,
      'attemptedRows', unverified_rows_delta,
      'attemptedRawBodyBytes', unverified_bytes_delta
    )::TEXT;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_project_activitypub_inbox_delivery_storage_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  retained_bytes_delta BIGINT;
  unverified_rows_delta BIGINT;
  unverified_bytes_delta BIGINT;
  counters activitypub_inbox_delivery_storage_counters%ROWTYPE;
BEGIN
  SELECT
    COALESCE((SELECT SUM(OCTET_LENGTH(raw_body)) FROM updated_deliveries), 0)
      - COALESCE((SELECT SUM(OCTET_LENGTH(raw_body)) FROM previous_deliveries), 0),
    COALESCE((SELECT COUNT(*) FROM updated_deliveries WHERE verified_at IS NULL), 0)
      - COALESCE((SELECT COUNT(*) FROM previous_deliveries WHERE verified_at IS NULL), 0),
    COALESCE((SELECT SUM(OCTET_LENGTH(raw_body)) FROM updated_deliveries WHERE verified_at IS NULL), 0)
      - COALESCE((SELECT SUM(OCTET_LENGTH(raw_body)) FROM previous_deliveries WHERE verified_at IS NULL), 0)
  INTO retained_bytes_delta, unverified_rows_delta, unverified_bytes_delta;

  UPDATE activitypub_inbox_delivery_storage_counters
  SET retained_raw_body_bytes = retained_raw_body_bytes + retained_bytes_delta,
      unverified_rows = unverified_rows + unverified_rows_delta,
      unverified_raw_body_bytes = unverified_raw_body_bytes + unverified_bytes_delta
  WHERE is_singleton
    AND (unverified_rows_delta <= 0 OR unverified_rows + unverified_rows_delta <= 10000)
    AND (
      unverified_bytes_delta <= 0
      OR unverified_raw_body_bytes + unverified_bytes_delta <= 268435456
    )
  RETURNING * INTO counters;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO counters
  FROM activitypub_inbox_delivery_storage_counters
  WHERE is_singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ActivityPub inbox storage counter singleton is missing';
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    CONSTRAINT = 'activitypub_inbox_delivery_work_items_unverified_capacity',
    MESSAGE = 'ActivityPub inbox unverified storage capacity exceeded',
    DETAIL = json_build_object(
      'unverifiedRows', counters.unverified_rows,
      'unverifiedRawBodyBytes', counters.unverified_raw_body_bytes,
      'attemptedRows', unverified_rows_delta,
      'attemptedRawBodyBytes', unverified_bytes_delta
    )::TEXT;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_project_activitypub_inbox_delivery_storage_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  retained_rows_delta BIGINT;
  retained_bytes_delta BIGINT;
  unverified_rows_delta BIGINT;
  unverified_bytes_delta BIGINT;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(OCTET_LENGTH(raw_body)), 0),
         COUNT(*) FILTER (WHERE verified_at IS NULL),
         COALESCE(SUM(OCTET_LENGTH(raw_body)) FILTER (WHERE verified_at IS NULL), 0)
  INTO retained_rows_delta, retained_bytes_delta, unverified_rows_delta, unverified_bytes_delta
  FROM deleted_deliveries;

  UPDATE activitypub_inbox_delivery_storage_counters
  SET retained_rows = retained_rows - retained_rows_delta,
      retained_raw_body_bytes = retained_raw_body_bytes - retained_bytes_delta,
      unverified_rows = unverified_rows - unverified_rows_delta,
      unverified_raw_body_bytes = unverified_raw_body_bytes - unverified_bytes_delta
  WHERE is_singleton;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'ActivityPub inbox storage counter singleton is missing';
  END IF;
  RETURN NULL;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_activitypub_inbox_work_items_storage_after_insert
AFTER INSERT ON activitypub_inbox_delivery_work_items
REFERENCING NEW TABLE AS inserted_deliveries
FOR EACH STATEMENT
EXECUTE FUNCTION fn_project_activitypub_inbox_delivery_storage_after_insert();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_activitypub_inbox_work_items_storage_after_update
AFTER UPDATE ON activitypub_inbox_delivery_work_items
REFERENCING OLD TABLE AS previous_deliveries NEW TABLE AS updated_deliveries
FOR EACH STATEMENT
EXECUTE FUNCTION fn_project_activitypub_inbox_delivery_storage_after_update();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_activitypub_inbox_work_items_storage_after_delete
AFTER DELETE ON activitypub_inbox_delivery_work_items
REFERENCING OLD TABLE AS deleted_deliveries
FOR EACH STATEMENT
EXECUTE FUNCTION fn_project_activitypub_inbox_delivery_storage_after_delete();

COMMENT ON TABLE activitypub_inbox_delivery_storage_counters IS 'Transactionally maintained singleton ledger for retained and unverified ActivityPub inbox row and raw-body byte totals.';
COMMENT ON COLUMN activitypub_inbox_delivery_storage_counters.is_singleton IS 'Always true; enforces the ledger has at most one aggregate row.';
COMMENT ON COLUMN activitypub_inbox_delivery_storage_counters.retained_rows IS 'Exact number of all durable ActivityPub inbox delivery rows currently retained.';
COMMENT ON COLUMN activitypub_inbox_delivery_storage_counters.retained_raw_body_bytes IS 'Exact sum of raw request-body bytes across all retained ActivityPub inbox deliveries.';
COMMENT ON COLUMN activitypub_inbox_delivery_storage_counters.unverified_rows IS 'Exact number of retained ActivityPub inbox deliveries that have not been verified.';
COMMENT ON COLUMN activitypub_inbox_delivery_storage_counters.unverified_raw_body_bytes IS 'Exact sum of raw request-body bytes across retained unverified ActivityPub inbox deliveries.';
