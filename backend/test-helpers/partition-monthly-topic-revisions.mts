import { beginTransaction, write } from '@data-stores/psql'
import { createTopicRevision } from '../services/topic-revisions/index.mts'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import {
  buildMonthlyPartitionName,
  generateMonthlyPartitionStatements,
  retireMonthlyPartition,
} from '@vouchington/postgres/partitions'
import sql from 'sql-template-strings'

const historicalMonth = new Date('1999-12-01T00:00:00.000Z')
const partition = buildMonthlyPartitionName('topic_revisions', 1999, 12)

/** Task-owned historical child; the caller must retire it in finally. */
export async function createTestTopicRevisionRetirementChild() {
  const { rows } = await write<{ existing: string | null }>(sql`
    /* topicRevisionRetirementFixture:checkAbsent */
    SELECT to_regclass(${partition})::text AS existing
  `)
  if (rows[0]?.existing !== null) throw new Error(`Fixture partition already exists: ${partition}`)
  const [statement] = generateMonthlyPartitionStatements({
    tables: [{ table: 'topic_revisions', pastMonths: 0, futureMonths: 0 }],
    baseDate: historicalMonth,
  })
  await write(`/* createTestTopicRevisionRetirementChild */ ${statement!}`)
  return { partition, cleanup: cleanupOwnedChild }
}

async function cleanupOwnedChild(): Promise<void> {
  const { rows } = await write<{ existing: string | null }>(sql`
    /* topicRevisionRetirementFixture:checkAttached */
    SELECT to_regclass(${partition})::text AS existing
  `)
  if (rows[0]?.existing === null) return
  await using transaction = await beginTransaction()
  await retireMonthlyPartition(transaction, {
    table: 'topic_revisions',
    partitionName: partition,
    year: 1999,
    month: 12,
    dropPriority: 0,
  })
  await transaction.commit()
}

export async function seedTestHistoricalTopicRevision(topicId: string, revisedById: string) {
  const revisionId = getMinUUIDv7ForDate(new Date('1999-12-15T00:00:00.000Z'))
  await using transaction = await beginTransaction()
  await transaction(sql`
    /* seedTestHistoricalTopicRevision */
    INSERT INTO topic_revisions (id, topic_id, revision_type, revised_by_id, changes)
    VALUES (
      ${revisionId}, ${topicId}, 'update', ${revisedById},
      '{"revised_by_roles":["administrator"],"changes":{"markdown":{"before":"","after":"Historical content"}}}'::jsonb
    )
  `)
  await transaction(sql`
    /* seedTestHistoricalTopicRevision:currentAttribution */
    UPDATE topics
    SET markdown = 'Historical content',
        content_updated_at = ${new Date('1999-12-15T00:00:00.000Z')},
        content_updated_by_id = ${revisedById}
    WHERE id = ${topicId}
  `)
  await transaction.commit()
  return revisionId
}

export async function withTestTopicRevisionWriter(
  topicId: string,
  revisedById: string,
  whileWriting: () => Promise<void>,
): Promise<void> {
  await using transaction = await beginTransaction()
  await createTopicRevision(
    topicId,
    'update',
    { markdown: { before: '', after: 'Active writer' } },
    revisedById,
    { query: transaction },
  )
  await whileWriting()
  await transaction.commit()
}

/** Leave a raw history insert open so its parent lock precedes deferred FK validation. */
export async function withTestRawTopicRevisionWriter(
  topicId: string,
  revisedById: string,
  whileWriting: () => Promise<void>,
): Promise<string> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`
    /* insertTestRawTopicRevision */
    INSERT INTO topic_revisions (topic_id, revision_type, revised_by_id)
    VALUES (${topicId}, 'update', ${revisedById})
    RETURNING id
  `)
  if (!rows[0]) throw new Error('Expected inserted topic revision')
  await whileWriting()
  await transaction.commit()
  return rows[0].id
}

export async function readTestTopicRevisionChild(revisionId: string): Promise<string> {
  const { rows } = await write<{ partition: string }>(sql`
    /* readTestTopicRevisionChild */
    SELECT tableoid::regclass::text AS partition
    FROM topic_revisions
    WHERE id = ${revisionId}
  `)
  if (!rows[0]) throw new Error('Expected a topic revision')
  return rows[0].partition
}

export async function readTestTopicMarkdown(topicId: string): Promise<string> {
  const { rows } = await write<{ markdown: string }>(sql`
    /* readTestTopicMarkdown */
    SELECT markdown FROM topics WHERE id = ${topicId}
  `)
  if (!rows[0]) throw new Error('Expected a topic')
  return rows[0].markdown
}
