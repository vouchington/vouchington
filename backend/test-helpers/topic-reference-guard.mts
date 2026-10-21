import { beginTransaction, write } from '@data-stores/psql'
import { lockTopicRssFeedAttachmentLifecycle } from '../services/post-publication/lock.mts'

export async function insertTopicReferenceGuardFollow(topicId: string, userId: string) {
  await write(
    `/* insertTopicReferenceGuardFollow */ INSERT INTO relation__user__follow__topic (subject_id, object_id)
    VALUES ($1::uuid, $2::uuid) ON CONFLICT (subject_id, object_id) DO UPDATE SET deleted_at = NULL`,
    [userId, topicId],
  )
}

export async function withTopicReferenceGuardFence<T>(
  topicId: string,
  operation: () => Promise<T>,
) {
  await using query = await beginTransaction()
  await lockTopicRssFeedAttachmentLifecycle(query, topicId)
  const result = await operation()
  await query.commit()
  return result
}

export async function getTopicReferenceGuardCoverage() {
  const { rows } = await write<{ table_name: string; column_name: string; guarded: boolean }>(
    `/* getTopicReferenceGuardCoverage */ SELECT source.relname AS table_name,
      attribute.attname AS column_name,
      EXISTS (
        SELECT 1 FROM pg_trigger trigger_record
        JOIN pg_proc procedure_record ON procedure_record.oid = trigger_record.tgfoid
        WHERE trigger_record.tgrelid = constraint_record.conrelid
          AND procedure_record.proname = 'fn_guard_active_topic_references'
          AND trigger_record.tgenabled <> 'D'
          AND position(
            decode('00', 'hex') || convert_to(attribute.attname, 'UTF8') || decode('00', 'hex')
            IN decode('00', 'hex') || trigger_record.tgargs
          ) > 0
      ) AS guarded
    FROM pg_constraint constraint_record
    JOIN pg_class source ON source.oid = constraint_record.conrelid
    JOIN pg_namespace namespace ON namespace.oid = source.relnamespace
    CROSS JOIN LATERAL unnest(constraint_record.conkey) AS key_column(attribute_number)
    JOIN pg_attribute attribute ON attribute.attrelid = source.oid AND attribute.attnum = key_column.attribute_number
    WHERE constraint_record.contype = 'f' AND constraint_record.conparentid = 0
      AND namespace.nspname = 'public' AND NOT source.relispartition
      AND constraint_record.confrelid = ANY(ARRAY[
        'topics'::regclass, 'card_topics'::regclass, 'fediverse_instance_topics'::regclass,
        'referral_program_topics'::regclass, 'retailer_topics'::regclass,
        'rewards_program_status_topics'::regclass, 'rewards_program_topics'::regclass,
        'spending_category_topics'::regclass
      ])
    ORDER BY source.relname, attribute.attname`,
  )
  return rows
}

export async function getActiveTopicReferenceGuardFollows(topicIds: string[], userId: string) {
  const { rows } = await write<{ object_id: string }>(
    `/* getActiveTopicReferenceGuardFollows */
    SELECT object_id FROM relation__user__follow__topic
    WHERE subject_id = $1::uuid AND object_id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [userId, topicIds],
  )
  return rows
}
