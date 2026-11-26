import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { listModerationAppealPage } from '@services/moderation-appeals/list-page'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { contentHash } from '../seed-data/common.mts'

const PAGE_SIZE = 100
const APPELLANT_PENDING = 2 * PAGE_SIZE + 1
const APPEAL_COUNT = 2_401
const APPELLANT_COUNT = 24

export async function runModerationAppealListCapacity(): Promise<void> {
  const fixture = await seedAppeals()
  try {
    await write('/* analyzeModerationAppealListCapacity */ ANALYZE moderation_appeals')
    await captureAppealPages('moderation-appeals-staff-at-cap', fixture.pendingIds)
    await captureAppealPages(
      'moderation-appeals-appellant-at-cap',
      fixture.appellantPendingIds,
      fixture.appellantId,
    )
  } finally {
    await using cleanup = await beginTransaction()
    await cleanup(sql`
      /* cleanupModerationAppealListPosts */
      DELETE FROM posts WHERE id = ANY(${fixture.postIds}::uuid[])`)
    await cleanup(sql`
      /* cleanupModerationAppealListUsers */
      DELETE FROM users WHERE id = ANY(${fixture.userIds}::uuid[])`)
    await cleanup.commit()
  }
}

async function captureAppealPages(
  scenario: string,
  expectedIds: string[],
  appellantUserId?: string,
) {
  const name = 'listModerationAppeals'
  const args = { appellantUserId, limit: PAGE_SIZE }
  // The appellant plan has a separate follow-up: https://github.com/vouchington/vouchington/issues/6544
  const rowBounds = appellantUserId ? [1301, 1101] : [PAGE_SIZE + 1, PAGE_SIZE + 1]
  registerScenarioContract(scenario, {
    seededRows: { moderation_appeals: APPEAL_COUNT },
    expectations: [
      ...rowBounds.map((max, captureIndex) => ({
        kind: 'maxProcessedRows' as const,
        relation: 'moderation_appeals',
        max,
        captureIndex,
      })),
      ...(appellantUserId
        ? []
        : [
            {
              kind: 'usesIndexes' as const,
              indexes: ['idx_moderation_appeals__status_created'],
              noSort: true,
            },
          ]),
    ],
  })
  let continuation: string | null = null
  await runAndCapture(
    scenario,
    async () => {
      for (const offset of [0, PAGE_SIZE]) {
        const page = await listModerationAppealPage({ ...args, after: continuation ?? undefined })
        assert.deepEqual(
          page.appeals.map(row => row.id),
          expectedIds.slice(offset, offset + PAGE_SIZE),
        )
        assert.equal(page.page_info.has_next_page, true)
        continuation = page.page_info.end_cursor
        assert.ok(continuation)
      }
    },
    undefined,
    name,
    {
      exactCapturedNames: [name, name],
      afterCapture: async () => {
        if (!appellantUserId) return
        assert.ok(continuation)
        const last = await listModerationAppealPage({ ...args, after: continuation })
        assert.deepEqual(
          last.appeals.map(row => row.id),
          expectedIds.slice(2 * PAGE_SIZE),
        )
        assert.equal(last.page_info.has_next_page, false)
        assert.equal(last.page_info.end_cursor, null)
      },
    },
  )
}

async function seedAppeals() {
  await using query = await beginTransaction()
  const prefix = `appeal-capacity-${randomUUID()}`
  const { rows: users } = await query<{ id: string; username: string }>(sql`
    /* seedModerationAppealListUsers */
    INSERT INTO users (username)
    SELECT ${prefix} || '-' || n FROM generate_series(0, ${APPELLANT_COUNT - 1}) n
    RETURNING id, username`)
  const appellantId = users.find(user => user.username === `${prefix}-0`)!.id
  const userIds = users.filter(user => user.id !== appellantId).map(user => user.id)
  const hash = contentHash('moderation-appeal-list-capacity')
  const { rows: posts } = await query<{ id: string; created_by_id: string; title: string }>(sql`
    /* seedModerationAppealListPosts */
    INSERT INTO posts (created_by_id, post_type, title, markdown, created_via, broadcast, privacy,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT CASE WHEN n <= ${APPELLANT_PENDING} OR n % 17 = 0 THEN ${appellantId}::uuid
                ELSE (${userIds}::uuid[])[1 + n % ${userIds.length}] END,
           'discussion', n::text, 'Synthetic appeal target', 'system', 'everyone', 'public', ${hash}, ${hash}
    FROM generate_series(1, ${APPEAL_COUNT}) n
    RETURNING id, created_by_id, title`)
  const postIds = posts.map(post => post.id)
  const { rows: appeals } = await query<{
    id: string
    appellant_user_id: string
    pending: boolean
  }>(sql`
    /* seedModerationAppealListRows */
    WITH cases AS (
      INSERT INTO moderation_cases (post_id)
      SELECT id FROM posts WHERE id = ANY(${postIds}::uuid[])
      RETURNING id, post_id
    ), targets AS (
      SELECT p.id, p.created_by_id, cases.id AS case_id, p.title::integer AS n
      FROM cases JOIN posts p ON p.id = cases.post_id
    )
    INSERT INTO moderation_appeals
      (created_via, appellant_user_id, post_id, post_removal_kind, appeal_reason, case_id,
        resolved_at, resolution_action)
    SELECT 'api', created_by_id, id, 'platform', 'EXPLAIN capacity fixture', case_id,
      CASE WHEN n > ${APPELLANT_PENDING} AND (n % 17 = 0 OR n % 4 <> 0) THEN CURRENT_TIMESTAMP END,
      CASE WHEN n > ${APPELLANT_PENDING} AND (n % 17 = 0 OR n % 4 <> 0)
        THEN 'deny'::moderation_appeal_actions END
    FROM targets
    ORDER BY n % 11, n
    RETURNING id, appellant_user_id, resolved_at IS NULL AS pending`)
  await query.commit()
  const pending = appeals.filter(row => row.pending).toSorted((a, b) => b.id.localeCompare(a.id))
  return {
    appellantId,
    userIds: [appellantId, ...userIds],
    postIds,
    pendingIds: pending.map(row => row.id),
    appellantPendingIds: pending
      .filter(row => row.appellant_user_id === appellantId)
      .map(row => row.id),
  }
}
