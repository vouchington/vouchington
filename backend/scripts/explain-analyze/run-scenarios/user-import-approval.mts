import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const cursor = '019e0000-7e00-7000-8000-000000002710'

export async function runUserImportApprovalScenarios(): Promise<void> {
  {
    // Keep updates uncommitted while ANALYZE records pages that cannot be all-visible.
    // Other connections still see the original seeded rows under read committed.
    await using transaction = await beginTransaction()
    await transaction(`/* obscureUserImportApprovalVisibility */
      UPDATE user_import_requests SET input_value = input_value
      WHERE id >= '019e0000-7e00-7000-8000-000000000000'::uuid
        AND id < '019e0000-7e00-7000-8000-000000004e20'::uuid`)
    await write('/* analyzeUserImportApprovalInvisible */ ANALYZE user_import_requests')
    await runApprovalPages('')
  }

  await write('/* vacuumUserImportApproval */ VACUUM (ANALYZE) user_import_requests')
  await runApprovalPages('-vacuumed')
}

async function runApprovalPages(suffix: string): Promise<void> {
  await runApprovalPage(suffix, false)
  await runApprovalPage(suffix, true)
}

async function runApprovalPage(suffix: string, continuation: boolean): Promise<void> {
  const label = `user-import-approval-${continuation ? 'continuation' : 'first-page'}${suffix}`
  registerScenarioContract(label, {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_user_import_requests__topic_recommendation'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'user_import_requests', max: 102 },
    ],
    seededRows: { user_import_requests: 20_000 },
  })
  await runAndCapture(label, async () => {
    const result = continuation
      ? await write(
          `/* autoFollowOnRecommendationApproval:findPending */
           SELECT id, user_id FROM user_import_requests
           WHERE topic_recommendation_post_id = ANY($1::uuid[]) AND followed_at IS NULL
             AND id > $2::uuid
           ORDER BY topic_recommendation_post_id, id LIMIT $3`,
          [[seedUuid(3, '05')], cursor, 100],
        )
      : await write(
          `/* autoFollowOnRecommendationApproval:findPending */
           SELECT id, user_id FROM user_import_requests
           WHERE topic_recommendation_post_id = ANY($1::uuid[]) AND followed_at IS NULL
           ORDER BY topic_recommendation_post_id, id LIMIT $2`,
          [[seedUuid(3, '05')], 100],
        )
    assert.deepEqual(
      result.rows,
      Array.from({ length: 100 }, (_, index) => {
        const n = (continuation ? 10_010 : 0) + index * 10
        const hex = n.toString(16).padStart(12, '0')
        return {
          id: `019e0000-7e00-7000-8000-${hex}`,
          user_id: `019e0000-0100-7000-8000-${hex}`,
        }
      }),
    )
  })
}
