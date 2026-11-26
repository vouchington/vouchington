import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { findElectedTopicRelationFlagConflicts } from '@services/topics/merge-relation-flags'
import { inspectElectedTopicRelationGroups } from '@services/topics/merge-relation-group'
import { getTopicMergeWorkLimit } from '@services/topics/merge-work-limits'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runTopicMergeRelationFlagCapacity(): Promise<void> {
  const scenario = 'topic-merge-relation-preflight-at-cap'
  const cohort = `explain-topic-relations-${randomUUID()}`
  const limit = getTopicMergeWorkLimit('page_size')
  const { rows: topics } = await write<{
    id: string
    slug: string
  }>(sql`/* seedExplainTopicMergeRelationTopics */
    INSERT INTO topics (name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    SELECT label, label, 'system', decode(repeat('00', 32), 'hex')
    FROM (
      SELECT ${cohort} || '-' || lpad(ordinal::text, 4, '0') AS label
      FROM generate_series(0, ${limit + 1}::int) AS input(ordinal)
    ) AS names RETURNING id, slug`)
  const [source, destination, ...subjects] = topics
    .toSorted((first, second) => first.slug.localeCompare(second.slug))
    .map(topic => topic.id)
  assert.ok(source && destination)
  assert.equal(subjects.length, limit)
  try {
    const { rows: relations } = await write<{
      id: string
      subject_id: string
      object_id: string
    }>(sql`/* seedExplainTopicMergeCategoryRelations */
      INSERT INTO relation__topic__category__topic (subject_id, object_id, created_by_id)
      SELECT input.subject_id, input.object_id, ${seedUser.id}
      FROM (
        SELECT subjects.id AS subject_id, targets.id AS object_id
        FROM unnest(${subjects}::uuid[]) AS subjects(id)
        CROSS JOIN unnest(${[source, destination]}::uuid[]) AS targets(id)
      ) AS input RETURNING id, subject_id, object_id`)
    assert.equal(relations.length, limit * 2)
    const backgroundObjects = Array.from({ length: 32 }, (_, index) => seedUuid(2000 + index, '04'))
    await write(sql`/* seedExplainTopicMergeUnrelatedCategoryRelations */
      INSERT INTO relation__topic__category__topic (subject_id, object_id, created_by_id)
      SELECT subjects.id, targets.id, ${seedUser.id}
      FROM unnest(${subjects}::uuid[]) AS subjects(id)
      CROSS JOIN unnest(${backgroundObjects}::uuid[]) AS targets(id)`)
    await write(
      '/* analyzeExplainTopicMergeCategoryRelations */ ANALYZE relation__topic__category__topic',
    )
    const sourceRelations = new Map(
      relations.filter(row => row.object_id === source).map(row => [row.subject_id, row.id]),
    )
    const destinationRelations = new Map(
      relations.filter(row => row.object_id === destination).map(row => [row.subject_id, row.id]),
    )
    const conflicts = new Set(subjects.filter((_, index) => index % 2 === 0))
    const { rows: pendingFlags } = await write<{ id: string; relation_id: string }>(
      sql`/* seedExplainTopicMergePendingFlags */
      INSERT INTO vote_integrity_flags (
        relation__topic__category__topic_id, relation__topic__category__topic_subject_id, flag_type
      )
      SELECT input.id, input.subject_id, input.flag_type
      FROM unnest(
        ${relations.map(row => row.id)}::uuid[],
        ${relations.map(row => row.subject_id)}::uuid[],
        ${relations.map(row => (row.object_id === source || conflicts.has(row.subject_id) ? 'velocity_spike' : 'ip_correlation'))}::vote_integrity_flag_types[]
      ) AS input(id, subject_id, flag_type)
      RETURNING id, relation__topic__category__topic_id AS relation_id`,
    )
    const doubleFlagged = relations.filter(row => conflicts.has(row.subject_id))
    await write(sql`/* seedExplainTopicMergeSecondPendingFlags */
      INSERT INTO vote_integrity_flags (
        relation__topic__category__topic_id, relation__topic__category__topic_subject_id, flag_type
      )
      SELECT input.relation_id, input.subject_id, 'ip_correlation'
      FROM unnest(
        ${doubleFlagged.map(row => row.id)}::uuid[], ${doubleFlagged.map(row => row.subject_id)}::uuid[]
      ) AS input(relation_id, subject_id)`)
    await write(sql`/* seedExplainTopicMergeResolvedFlags */
      INSERT INTO vote_integrity_flags (
        relation__topic__category__topic_id, relation__topic__category__topic_subject_id,
        flag_type, resolved_at, resolution
      )
      SELECT input.relation_id, input.subject_id, 'velocity_spike', TIMESTAMPTZ '2025-01-01', 'dismissed'
      FROM unnest(
        ${relations.map(row => row.id)}::uuid[], ${relations.map(row => row.subject_id)}::uuid[]
      ) AS input(relation_id, subject_id)
      CROSS JOIN generate_series(1, 32)`)
    await write('/* analyzeExplainTopicMergeFlags */ ANALYZE vote_integrity_flags')
    const {
      rows: [corpus],
    } = await write<{ flags: number }>(sql`/* countExplainTopicMergeFlagCorpus */
      SELECT count(*)::int AS flags FROM vote_integrity_flags`)
    assert.ok(corpus)
    const flagByRelation = new Map(pendingFlags.map(row => [row.relation_id, row.id]))
    registerScenarioContract(scenario, {
      seededRows: { vote_integrity_flags: corpus.flags },
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'relation__topic__category__topic',
          max: limit * 2,
          captureIndex: 0,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'vote_integrity_flags',
          max: pendingFlags.length + doubleFlagged.length,
          captureIndex: 1,
        },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        await using query = await beginTransaction()
        const pairs = subjects.map(subject_id => ({ subject_id, object_id: source }))
        const groups = await inspectElectedTopicRelationGroups(
          query,
          'relation__topic__category__topic',
          source,
          destination,
          pairs,
        )
        assert.deepEqual(
          groups.map(group => [
            group.nextSubjectId,
            group.nextObjectId,
            ...group.relations.map(row => row.id),
          ]),
          subjects.map(subject => [
            subject,
            destination,
            destinationRelations.get(subject),
            sourceRelations.get(subject),
          ]),
        )
        assert.deepEqual(
          await findElectedTopicRelationFlagConflicts(query, groups, source),
          subjects.map(subject =>
            conflicts.has(subject)
              ? {
                  kind: 'audit_flag',
                  sourceId: flagByRelation.get(sourceRelations.get(subject)!),
                  destinationId: flagByRelation.get(destinationRelations.get(subject)!),
                }
              : null,
          ),
        )
        await query.rollback()
      },
      undefined,
      ['inspectElectedTopicRelationGroups', 'findElectedTopicRelationFlagConflicts'],
    )
  } finally {
    await write(sql`/* cleanupExplainTopicMergeRelationTopics */
      WITH removed AS (
        DELETE FROM topics WHERE id = ANY(${topics.map(topic => topic.id)}::uuid[]) RETURNING id
      )
      DELETE FROM retained_topic_identities identity USING removed WHERE identity.id = removed.id`)
  }
}
