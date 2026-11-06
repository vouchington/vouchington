-- Generated relations and handwritten references share the merge's dedicated lifecycle fence.
CREATE OR REPLACE FUNCTION fn_ensure_active_topic_references()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  reference_column TEXT;
  referenced_topic_id UUID;
  previous_topic_id UUID;
  reserved_topic_id UUID;
BEGIN
  FOREACH reference_column IN ARRAY TG_ARGV LOOP
    -- Inspect both sides: a deletion or non-key edit can change a merge preflight or capture.
    referenced_topic_id := NULL;
    previous_topic_id := NULL;
    IF TG_OP <> 'DELETE' THEN
      EXECUTE format('SELECT ($1).%I', reference_column) INTO referenced_topic_id USING NEW;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      EXECUTE format('SELECT ($1).%I', reference_column) INTO previous_topic_id USING OLD;
    END IF;
    FOR reserved_topic_id IN
      SELECT DISTINCT id FROM unnest(ARRAY[previous_topic_id, referenced_topic_id]) AS ids(id)
      WHERE id IS NOT NULL ORDER BY id
    LOOP
      -- Never wait while holding a child row or publication scope: admission takes this fence first.
      IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(
        'topic-merge-lifecycle:' || reserved_topic_id::TEXT, 0
      )) THEN
        RAISE EXCEPTION USING ERRCODE = 'V0409',
          MESSAGE = 'Topic references are changing; retry the request',
          DETAIL = json_build_object('code', 'topic_reference_busy', 'topic_id', reserved_topic_id)::TEXT;
      END IF;
      IF TG_TABLE_NAME = 'relation__topic__parent__topic' AND reference_column = 'subject_id' AND EXISTS (
        SELECT 1 FROM topic_merge_parent_ancestors ancestor
        JOIN topic_merge_operations merge_operation ON merge_operation.id = ancestor.operation_id
        WHERE ancestor.topic_id = reserved_topic_id
          AND merge_operation.completed_at IS NULL AND merge_operation.failed_at IS NULL
          AND (merge_operation.id::TEXT, merge_operation.fence_token::TEXT) IS DISTINCT FROM
            (COALESCE(current_setting('voucha.topic_merge_operation_id', TRUE), ''),
             COALESCE(current_setting('voucha.topic_merge_fence_token', TRUE), ''))
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'V0409', MESSAGE = 'Topic parent ancestry is reserved by a merge',
          DETAIL = json_build_object('code', 'topic_merge_in_progress', 'topic_id', reserved_topic_id)::TEXT;
      END IF;
      IF EXISTS (
        SELECT 1 FROM topic_merge_operations merge_operation
        WHERE (merge_operation.source_topic_id = reserved_topic_id
            OR merge_operation.destination_topic_id = reserved_topic_id)
          AND merge_operation.completed_at IS NULL AND merge_operation.failed_at IS NULL
          AND (merge_operation.id::TEXT, merge_operation.fence_token::TEXT) IS DISTINCT FROM
            (COALESCE(current_setting('voucha.topic_merge_operation_id', TRUE), ''),
             COALESCE(current_setting('voucha.topic_merge_fence_token', TRUE), ''))
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'V0409',
          MESSAGE = 'Topic merge is in progress',
          DETAIL = json_build_object('code', 'topic_merge_in_progress', 'topic_id', reserved_topic_id)::TEXT;
      END IF;
    END LOOP;
    -- Missing identities remain the foreign key constraint's responsibility.
    IF referenced_topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topics WHERE id = referenced_topic_id
        AND (deleted_at IS NOT NULL OR merged_into_topic_id IS NOT NULL)
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'V0409',
        MESSAGE = 'Topic reference must identify an active topic',
        DETAIL = json_build_object('code', 'topic_reference_inactive', 'topic_id', referenced_topic_id)::TEXT;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_ensure_active_topic_references() IS
  'Fences current reference mutations against admission and active merge reservations without waiting behind a child-row lock. Historical references remain unfenced.';

CREATE OR REPLACE FUNCTION fn_ensure_topic_merge_participant_not_reserved()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM topic_merge_operations merge_operation
    WHERE (merge_operation.source_topic_id = OLD.id
        OR merge_operation.destination_topic_id = OLD.id)
      AND merge_operation.completed_at IS NULL AND merge_operation.failed_at IS NULL
      AND (merge_operation.id::TEXT, merge_operation.fence_token::TEXT) IS DISTINCT FROM
        (COALESCE(current_setting('voucha.topic_merge_operation_id', TRUE), ''),
         COALESCE(current_setting('voucha.topic_merge_fence_token', TRUE), ''))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'V0409',
      MESSAGE = 'Topic merge is in progress',
      DETAIL = json_build_object('code', 'topic_merge_in_progress', 'topic_id', OLD.id)::TEXT;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_ensure_topic_merge_participant_not_reserved() IS
  'Rejects ordinary topic mutation while a staged merge reserves either participant.';

CREATE OR REPLACE TRIGGER trigger_topic_merge_participant_reservation
BEFORE UPDATE OR DELETE ON topics
FOR EACH ROW EXECUTE FUNCTION fn_ensure_topic_merge_participant_not_reserved();
-- Both merge participants remain stable between bounded merge pages.

CREATE OR REPLACE FUNCTION fn_ensure_topic_merge_slug_alias_not_reserved()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  candidate_alias TEXT;
  source_id UUID;
BEGIN
  FOR candidate_alias IN
    SELECT DISTINCT alias FROM (
      SELECT CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.alias END AS alias
      UNION ALL
      SELECT CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.alias END
    ) aliases WHERE alias IS NOT NULL
  LOOP
    SELECT id INTO source_id FROM topics WHERE slug = candidate_alias AND deleted_at IS NULL LIMIT 1;
    IF source_id IS NULL THEN CONTINUE; END IF;
    IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(
      'topic-merge-lifecycle:' || source_id::TEXT, 0
    )) THEN
      RAISE EXCEPTION USING ERRCODE = 'V0409',
        MESSAGE = 'Topic alias is changing during a merge; retry the request',
        DETAIL = json_build_object('code', 'topic_reference_busy', 'topic_id', source_id)::TEXT;
    END IF;
    IF EXISTS (
      SELECT 1 FROM topic_merge_operations merge_operation
      WHERE merge_operation.source_topic_id = source_id
        AND merge_operation.completed_at IS NULL AND merge_operation.failed_at IS NULL
        AND (merge_operation.id::TEXT, merge_operation.fence_token::TEXT) IS DISTINCT FROM
          (COALESCE(current_setting('voucha.topic_merge_operation_id', TRUE), ''),
           COALESCE(current_setting('voucha.topic_merge_fence_token', TRUE), ''))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'V0409',
        MESSAGE = 'Topic merge is in progress',
        DETAIL = json_build_object('code', 'topic_merge_in_progress', 'topic_id', source_id)::TEXT;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_ensure_topic_merge_slug_alias_not_reserved() IS
  'Reserves the source slug alias text even while its alias row remains unlinked.';

CREATE OR REPLACE TRIGGER trigger_topic_merge_slug_alias_reservation
BEFORE INSERT OR UPDATE OR DELETE ON topic_aliases
FOR EACH ROW EXECUTE FUNCTION fn_ensure_topic_merge_slug_alias_not_reserved();
-- Alias ownership cannot change for a reserved merge source slug.

DO $$
DECLARE
  reference_table RECORD;
BEGIN
  FOR reference_table IN
    SELECT format('%I.%I', namespace.nspname, source.relname) AS qualified_name,
      string_agg(DISTINCT quote_literal(attribute.attname), ', ' ORDER BY quote_literal(attribute.attname)) AS column_arguments,
      string_agg(DISTINCT quote_ident(attribute.attname), ', ' ORDER BY quote_ident(attribute.attname)) AS update_columns
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
        'review_disputes', 'topic_revisions', 'user_import_requests', 'vote_integrity_flags',
        'image_surface_placements', 'topic_classifier_results',
        'topic_metrics', 'bedrock_embedding_batch_entities',
        'classifier_run_candidates', 'post_autotagger_result_topics',
        'rss_feed_item_autotagger_result_topics', 'autotagger_agent_run_topics',
        'post_classifier_local_outcomes', 'topic_merge_operations'
      ])
      AND source.relname NOT LIKE 'topic_merge_%'
      AND NOT (source.relname = 'topics' AND attribute.attname = 'merged_into_topic_id')
    GROUP BY namespace.nspname, source.relname
    ORDER BY namespace.nspname, source.relname
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trigger_active_topic_references BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION fn_ensure_active_topic_references(%s)',
      reference_table.qualified_name, reference_table.column_arguments
    );
    -- Current reference mutations serialize with merge capture and reject inactive targets.
  END LOOP;
END;
$$;

-- Vote and integrity-flag edits can change election collision ownership without editing a topic FK.
CREATE OR REPLACE FUNCTION fn_ensure_topic_merge_relation_child_not_reserved()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  parent_subject_id UUID;
  parent_relation_id UUID;
  participant_ids UUID[];
  participant_id UUID;
  candidate_record RECORD;
BEGIN
  FOR candidate_record IN SELECT * FROM (VALUES
    (CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END),
    (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END)
  ) candidates(row_value) WHERE row_value IS NOT NULL
  LOOP
    parent_subject_id := (candidate_record.row_value ->> TG_ARGV[1])::UUID;
    parent_relation_id := (candidate_record.row_value ->> TG_ARGV[2])::UUID;
    IF parent_relation_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT ARRAY[%s] FROM %I WHERE subject_id = $1 AND id = $2', TG_ARGV[3], TG_ARGV[0])
      INTO participant_ids USING parent_subject_id, parent_relation_id;
    FOR participant_id IN SELECT DISTINCT id FROM unnest(participant_ids) ids(id) WHERE id IS NOT NULL ORDER BY id
    LOOP
      IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('topic-merge-lifecycle:' || participant_id::TEXT, 0)) THEN
        RAISE EXCEPTION USING ERRCODE = 'V0409', MESSAGE = 'Topic vote target is changing; retry the request',
          DETAIL = json_build_object('code', 'topic_reference_busy', 'topic_id', participant_id)::TEXT;
      END IF;
      IF EXISTS (
        SELECT 1 FROM topic_merge_operations operation
        WHERE (operation.source_topic_id = participant_id OR operation.destination_topic_id = participant_id)
          AND operation.completed_at IS NULL AND operation.failed_at IS NULL
          AND (operation.id::TEXT, operation.fence_token::TEXT) IS DISTINCT FROM
            (COALESCE(current_setting('voucha.topic_merge_operation_id', TRUE), ''),
             COALESCE(current_setting('voucha.topic_merge_fence_token', TRUE), ''))
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'V0409', MESSAGE = 'Topic merge is in progress',
          DETAIL = json_build_object('code', 'topic_merge_in_progress', 'topic_id', participant_id)::TEXT;
      END IF;
    END LOOP;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION fn_ensure_topic_merge_relation_child_not_reserved() IS
  'Freezes elected relation vote and integrity-flag children for both reserved merge participants.';

DO $$
DECLARE
  parent RECORD;
  flag_trigger_name TEXT;
BEGIN
  FOR parent IN
    SELECT relation.relname AS table_name,
      string_agg(DISTINCT quote_ident(attribute.attname), ', ' ORDER BY quote_ident(attribute.attname)) AS topic_columns
    FROM pg_constraint constraint_record
    JOIN pg_class relation ON relation.oid = constraint_record.conrelid
    CROSS JOIN LATERAL unnest(constraint_record.conkey) AS key_column(attribute_number)
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid AND attribute.attnum = key_column.attribute_number
    WHERE constraint_record.contype = 'f' AND constraint_record.conparentid = 0
      AND constraint_record.confrelid = 'topics'::regclass
      AND relation.relname LIKE 'relation__%'
      AND NOT relation.relispartition
      AND to_regclass(relation.relname || '__votes') IS NOT NULL
    GROUP BY relation.relname ORDER BY relation.relname
  LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER trigger_topic_merge_relation_vote_reservation BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_ensure_topic_merge_relation_child_not_reserved(%L, %L, %L, %L)',
      parent.table_name || '__votes', parent.table_name, 'subject_id', 'entity_relation_id', parent.topic_columns);
    flag_trigger_name := 'trigger_topic_merge_flag_' || substr(md5(parent.table_name), 1, 16);
    EXECUTE format('CREATE OR REPLACE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON vote_integrity_flags FOR EACH ROW EXECUTE FUNCTION fn_ensure_topic_merge_relation_child_not_reserved(%L, %L, %L, %L)',
      flag_trigger_name, parent.table_name, parent.table_name || '_subject_id', parent.table_name || '_id', parent.topic_columns);
  END LOOP;
END;
$$;
