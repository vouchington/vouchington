import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getApplicationQuestions,
  setApplicationQuestions,
  type ApplicationQuestionInput,
} from '@services/communities/applications/questions'
import {
  COMMUNITY_APPLICATION_LIMIT_MAX_VALUES,
  communityApplicationLimitsConfig,
} from '@services/communities/applications/question-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

export async function runApplicationQuestions(): Promise<void> {
  const scenario = 'community-application-questions-write-at-cap'
  const cap = COMMUNITY_APPLICATION_LIMIT_MAX_VALUES.questions_per_community
  const { rows: communities } = await write<{
    id: string
  }>(sql`/* seedApplicationQuestionWriteCommunities */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    SELECT 'Explain form replacement', ${`explain-form-${randomUUID()}`} || '-' || n, ${seedUser.id}, 'system'
    FROM generate_series(0, 4) AS series(n)
    RETURNING id
  `)
  const communityIds = communities.map(community => community.id)
  const [communityId] = communityIds
  assert.equal(communityIds.length, 5)
  assert(communityId)

  try {
    await write(sql`/* seedApplicationQuestionWriteOwner */
      INSERT INTO community_members (community_id, user_id, role)
      VALUES (${communityId}, ${seedUser.id}, 'owner')
      ON CONFLICT DO NOTHING
    `)
    const { rows: before } = await write<QuestionRow>(sql`/* seedApplicationQuestionWriteHistory */
      INSERT INTO community_application_questions (community_id, question, order_index, deleted_at)
      SELECT community_id, 'Prior version ' || version || ' question ' || position, position,
        CASE WHEN version <> 0 THEN CURRENT_TIMESTAMP END
      FROM unnest(${communityIds}::uuid[]) AS forms(community_id)
      CROSS JOIN generate_series(0, ${cap - 1}) AS positions(position)
      CROSS JOIN generate_series(0, 3) AS versions(version)
      RETURNING id, community_id, deleted_at
    `)
    const retiredIds = before
      .filter(row => row.community_id === communityId && row.deleted_at === null)
      .map(row => row.id)
    assert.equal(before.length, communityIds.length * 4 * cap)
    assert.equal(retiredIds.length, cap)
    const replacement: ApplicationQuestionInput[] = Array.from({ length: cap }, (_, i) => ({
      question: `New question ${i + 1}`,
      field_type: 'short_text',
    }))
    const survivors = before.filter(
      row => row.community_id !== communityId || row.deleted_at !== null,
    )
    const replacementIds: string[] = []
    await write(
      '/* analyzeApplicationQuestionWriteCorpus */ ANALYZE community_application_questions',
    )
    registerScenarioContract(scenario, {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_community_application_questions__comm_order'] },
        { kind: 'maxProcessedRows', relation: 'community_application_questions', max: cap * 4 },
      ],
      forbidSequentialScans: ['community_application_questions'],
    })
    await communityApplicationLimitsConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(communityApplicationLimitsConfig, {
      questions_per_community: cap,
    })
    try {
      await runAndCapture(
        scenario,
        async () => {
          const result = await setApplicationQuestions(seedUser.id, communityId, replacement)
          assert.equal(result.length, cap)
          assert.equal(new Set(result.map(row => row.id)).size, cap)
          result.forEach((row, position) => {
            assert.equal(row.community_id, communityId)
            assert.equal(row.order_index, position)
            assert.equal(row.question, replacement[position]!.question)
            assert.equal(row.deleted_at, null)
            replacementIds.push(row.id)
          })
        },
        undefined,
        'setApplicationQuestions',
        {
          afterCapture: async () => {
            const current = await getApplicationQuestions(communityId)
            assert.deepEqual(
              current.map(row => row.id),
              replacementIds,
            )
            await assertQuestionHistory(communityIds, retiredIds, survivors)
            await restoreQuestionWriteStart(communityId, retiredIds, replacementIds)
          },
        },
      )
    } finally {
      restore()
    }
  } finally {
    await write(sql`/* deleteApplicationQuestionWriteCommunities */
      DELETE FROM communities WHERE id = ANY(${communityIds}::uuid[])
    `)
  }
}

type QuestionRow = { id: string; community_id: string; deleted_at: Date | null }

async function assertQuestionHistory(
  communityIds: string[],
  retiredIds: string[],
  survivors: QuestionRow[],
): Promise<void> {
  const { rows } = await write<QuestionRow>(sql`/* assertApplicationQuestionWriteHistory */
    SELECT id, community_id, deleted_at FROM community_application_questions
    WHERE community_id = ANY(${communityIds}::uuid[])
      AND id = ANY(${[...retiredIds, ...survivors.map(row => row.id)]}::uuid[])
    ORDER BY id
  `)
  const byId = new Map(rows.map(row => [row.id, row]))
  assert.equal(rows.length, retiredIds.length + survivors.length)
  retiredIds.forEach(id => assert(byId.get(id)?.deleted_at))
  survivors.forEach(row => assert.deepEqual(byId.get(row.id), row))
}

async function restoreQuestionWriteStart(
  communityId: string,
  retiredIds: string[],
  replacementIds: string[],
): Promise<void> {
  await write(sql`/* deleteApplicationQuestionWriteReplacements */
    DELETE FROM community_application_questions
    WHERE community_id = ${communityId} AND id = ANY(${replacementIds}::uuid[])
  `)
  await write(sql`/* restoreApplicationQuestionWriteHistory */
    UPDATE community_application_questions SET deleted_at = NULL
    WHERE community_id = ${communityId} AND id = ANY(${retiredIds}::uuid[])
  `)
}
