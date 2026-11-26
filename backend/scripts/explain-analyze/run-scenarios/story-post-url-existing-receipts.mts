import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getRelationTypeLimit } from '@services/entity-relations/relation-limits-config'
import { decideStoryPostRelatedUrlProjectionRows } from '@services/stories/story-post-related-url-projection-source'
import type {
  ProjectionWork,
  SourceRow,
} from '@services/stories/story-post-related-url-projection-types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function captureStoryPostUrlExistingReceipts(work: ProjectionWork): Promise<void> {
  const limit = getRelationTypeLimit('relation__post__related__url')
  assert.ok(limit)
  const { rows } = await write<SourceRow>(
    `/* seedExistingStoryPostUrlReceiptInputs */
     SELECT receipt.source_item_id AS id, receipt.url_id, url.url
     FROM story_post_related_url_projection_receipts receipt
     JOIN urls url ON url.id = receipt.url_id
     WHERE receipt.post_id = $1 AND receipt.generation = $2
     ORDER BY receipt.url_id LIMIT $3`,
    [work.post_id, work.generation, limit],
  )
  assert.equal(rows.length, limit)
  const blocked = rows[0]!
  const scenario = 'story-post-related-url-existing-receipts-default'
  const annotation = 'storyPostRelatedUrlProjectionExistingReceipts'
  await setEligibility(work, blocked.url_id, false)
  try {
    registerScenarioContract(scenario, { expectations: [] })
    await runAndCapture(
      scenario,
      async () => {
        const decisions = await decideStoryPostRelatedUrlProjectionRows(work, rows)
        assert.deepEqual(
          decisions,
          rows.map(row => ({ ...row, is_eligible: row.url_id !== blocked.url_id })),
        )
      },
      undefined,
      annotation,
      { exactCapturedNames: [annotation] },
    )
  } finally {
    await setEligibility(work, blocked.url_id, true)
  }
}

async function setEligibility(work: ProjectionWork, urlId: string, eligible: boolean) {
  const { rowCount } = await write(
    `/* seedExistingStoryPostUrlReceiptEligibility */
     UPDATE story_post_related_url_projection_receipts SET is_eligible = $4
     WHERE post_id = $1 AND generation = $2 AND url_id = $3`,
    [work.post_id, work.generation, urlId, eligible],
  )
  assert.equal(rowCount, 1)
}
