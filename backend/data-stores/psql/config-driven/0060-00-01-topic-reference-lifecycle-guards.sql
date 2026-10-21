-- Generated relations and handwritten references share the merge's attachment lifecycle fence.
CREATE OR REPLACE FUNCTION fn_ensure_active_topic_references()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  reference_column TEXT;
  referenced_topic_id UUID;
BEGIN
  FOREACH reference_column IN ARRAY TG_ARGV LOOP
    IF TG_OP = 'UPDATE' AND
      (to_jsonb(NEW) -> reference_column) IS NOT DISTINCT FROM (to_jsonb(OLD) -> reference_column)
    THEN
      CONTINUE;
    END IF;
    referenced_topic_id := (to_jsonb(NEW) ->> reference_column)::UUID;
    IF referenced_topic_id IS NULL THEN CONTINUE; END IF;

    -- Never wait while holding a child row or publication scope: the merge takes this fence first.
    IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(
      'topic-rss-feed-attachment:' || referenced_topic_id::TEXT, 0
    )) THEN
      RAISE EXCEPTION USING ERRCODE = 'V0409',
        MESSAGE = 'Topic references are changing; retry the request',
        DETAIL = json_build_object('code', 'topic_reference_busy', 'topic_id', referenced_topic_id)::TEXT;
    END IF;
    -- Missing identities remain the foreign key constraint's responsibility.
    -- A separate volatile SPI query observes the state after acquiring the lifecycle fence.
    IF EXISTS (
      SELECT 1 FROM topics WHERE id = referenced_topic_id
        AND (deleted_at IS NOT NULL OR merged_into_topic_id IS NOT NULL)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'V0409',
        MESSAGE = 'Topic reference must identify an active topic',
        DETAIL = json_build_object('code', 'topic_reference_inactive', 'topic_id', referenced_topic_id)::TEXT;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_ensure_active_topic_references() IS
  'Fences new topic references against merges without waiting behind a publication or child-row lock. Historical references remain unfenced.';

DO $$
DECLARE
  reference_table RECORD;
BEGIN
  FOR reference_table IN
    SELECT format('%I.%I', namespace.nspname, source.relname) AS qualified_name,
      string_agg(DISTINCT quote_literal(attribute.attname), ', ' ORDER BY quote_literal(attribute.attname)) AS column_arguments
    FROM pg_constraint constraint_record
    JOIN pg_class source ON source.oid = constraint_record.conrelid
    JOIN pg_namespace namespace ON namespace.oid = source.relnamespace
    CROSS JOIN LATERAL unnest(constraint_record.conkey) AS key_column(attribute_number)
    JOIN pg_attribute attribute ON attribute.attrelid = source.oid
      AND attribute.attnum = key_column.attribute_number
    WHERE constraint_record.contype = 'f' AND constraint_record.conparentid = 0
      AND namespace.nspname = 'public' AND NOT source.relispartition
      AND constraint_record.confrelid = ANY(ARRAY[
        'topics'::regclass, 'card_topics'::regclass, 'fediverse_instance_topics'::regclass,
        'referral_program_topics'::regclass, 'retailer_topics'::regclass,
        'rewards_program_status_topics'::regclass, 'rewards_program_topics'::regclass,
        'spending_category_topics'::regclass
      ])
      AND source.relname <> ALL(ARRAY[
        'admin_import_rows', 'fediverse_instance_integration_changes', 'moderator_actions',
        'review_disputes', 'topic_revisions', 'user_import_requests', 'vote_integrity_flags'
      ])
      AND NOT (source.relname = 'topics' AND attribute.attname = 'merged_into_topic_id')
    GROUP BY namespace.nspname, source.relname
    ORDER BY namespace.nspname, source.relname
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trigger_active_topic_references BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION fn_ensure_active_topic_references(%s)',
      reference_table.qualified_name, reference_table.column_arguments
    );
    EXECUTE format(
      'COMMENT ON TRIGGER trigger_active_topic_references ON %s IS %L',
      reference_table.qualified_name, 'Serializes changed topic references with merge capture and rejects inactive targets.'
    );
  END LOOP;
END;
$$;
