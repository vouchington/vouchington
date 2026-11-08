import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { relationLimitsMaxValues } from '@services/entity-relations/relation-limits-config'
import {
  markRelationReceiptsWritten,
  readStoryPostRelatedUrlProjectionPendingCrawlEffects,
} from '@services/stories/story-post-related-url-projection-admission-effects'
import {
  readStoryPostRelatedUrlProjectionActiveRelations,
  recordProjectionCrawlRequirements,
} from '@services/stories/story-post-related-url-projection-relation-safety'
import { stageStoryPostRelatedUrlProjectionReceipts } from '@services/stories/story-post-related-url-projection-source'
import type { SourceDecision } from '@services/stories/story-post-related-url-projection-types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { POST_URL_CAPACITY_SEED as seed } from '../seed-data/post-related-url-capacity.mts'
import { captureRollback } from './story-post-url-prefix-capture.mts'
import { captureLoweredCapPrune } from './story-post-url-prefix-lowered-prune.mts'
import { MAXIMUM_LEASE, projectionWork } from './story-post-url-prefix-setup.mts'

const RECEIPT_PK = 'story_post_related_url_projection_receipts_pkey'
const HARD_MAX = relationLimitsMaxValues.post_related_url

/** Receipt writes, the pending-crawl read, active relations, and a lowered-cap prune at the hard max. */
export async function captureStoryPostUrlPrefixEffectScenarios(
  relationIndexes: readonly string[],
): Promise<void> {
  const receipts = await maxCapReceipts()
  const urlIds = receipts.map(row => row.url_id)
  await captureActiveRelations(relationIndexes, urlIds)
  await capturePendingCrawls()
  await captureReceiptsWritten(receipts)
  await captureCrawlRequirements(urlIds)
  await captureLoweredCapPrune(relationIndexes)
  await captureReceiptInsert(receipts)
}

async function captureActiveRelations(
  relationIndexes: readonly string[],
  urlIds: readonly string[],
): Promise<void> {
  const id = 'story-post-related-url-active-relations-maximum'
  registerRelationContract(
    id,
    'storyPostRelatedUrlProjectionActiveRelationIds',
    relationIndexes,
    HARD_MAX,
  )
  await captureRollback(id, 'storyPostRelatedUrlProjectionActiveRelationIds', async query => {
    const rows = await readStoryPostRelatedUrlProjectionActiveRelations(
      query,
      seed.posts[1]!,
      seed.user,
      urlIds,
    )
    assert.equal(rows.length, HARD_MAX)
  })
}

async function capturePendingCrawls(): Promise<void> {
  const id = 'story-post-related-url-pending-crawls-maximum'
  registerReceiptContract(id, 'storyPostRelatedUrlProjectionPendingCrawlEffects', HARD_MAX)
  await runAndCapture(
    id,
    async () => {
      const pending = await readStoryPostRelatedUrlProjectionPendingCrawlEffects(
        projectionWork(seed.posts[1]!, MAXIMUM_LEASE),
      )
      assert.equal(pending.length, HARD_MAX)
    },
    undefined,
    'storyPostRelatedUrlProjectionPendingCrawlEffects',
  )
}

async function captureReceiptInsert(
  receipts: readonly { url_id: string; source_item_id: string }[],
): Promise<void> {
  const id = 'story-post-related-url-receipt-insert-maximum'
  registerReceiptContract(id, 'stageStoryPostRelatedUrlProjectionReceipts', HARD_MAX * 2)
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    () =>
      stageStoryPostRelatedUrlProjectionReceipts(
        projectionWork(seed.posts[1]!, MAXIMUM_LEASE),
        receiptDecisions(receipts),
        query,
      ),
    undefined,
    'stageStoryPostRelatedUrlProjectionReceipts',
    {
      afterCapture: async () => {
        await query.rollback()
        // Explain re-runs the insert. Clearing the committed copies makes that insert write the cap.
        await write(
          `/* restoreStoryPostUrlPrefix:receipts-for-insert */ DELETE FROM story_post_related_url_projection_receipts WHERE post_id = $1`,
          [seed.posts[1]],
        )
      },
    },
  )
}

async function captureReceiptsWritten(
  receipts: readonly { url_id: string; source_item_id: string }[],
): Promise<void> {
  const id = 'story-post-related-url-receipts-written-maximum'
  registerReceiptContract(id, 'markStoryPostRelatedUrlProjectionRelationsWritten', HARD_MAX * 2)
  await captureRollback(id, 'markStoryPostRelatedUrlProjectionRelationsWritten', query =>
    markRelationReceiptsWritten(
      query,
      projectionWork(seed.posts[1]!, MAXIMUM_LEASE),
      receiptDecisions(receipts),
    ).then(written => assert.equal(written, true)),
  )
}

async function captureCrawlRequirements(urlIds: readonly string[]): Promise<void> {
  const id = 'story-post-related-url-crawl-requirements-maximum'
  registerReceiptContract(id, 'recordStoryPostRelatedUrlProjectionCrawlRequirements', HARD_MAX * 2)
  await captureRollback(id, 'recordStoryPostRelatedUrlProjectionCrawlRequirements', query =>
    recordProjectionCrawlRequirements(
      query,
      projectionWork(seed.posts[1]!, MAXIMUM_LEASE),
      [],
      new Set(urlIds),
    ),
  )
}

function registerRelationContract(
  id: string,
  queryContains: string,
  indexes: readonly string[],
  max: number,
): void {
  registerScenarioContract(id, {
    expectations: [
      { kind: 'usesIndexes', indexes, anyOf: true, queryContains },
      { kind: 'maxProcessedRows', relation: 'relation__post__related__url', max },
    ],
    forbidSequentialScans: ['relation__post__related__url'],
    seededRows: { relation__post__related__url: seed.relationRows },
  })
}

function registerReceiptContract(id: string, queryContains: string, max: number): void {
  registerScenarioContract(id, {
    expectations: [
      { kind: 'usesIndexes', indexes: [RECEIPT_PK], queryContains },
      { kind: 'maxProcessedRows', relation: 'story_post_related_url_projection_receipts', max },
    ],
    forbidSequentialScans: ['story_post_related_url_projection_receipts'],
    seededRows: { story_post_related_url_projection_receipts: HARD_MAX },
  })
}

async function maxCapReceipts(): Promise<Array<{ url_id: string; source_item_id: string }>> {
  const { rows } = await write<{ url_id: string; source_item_id: string }>(
    `/* storyPostUrlPrefixReceiptRows */
     SELECT url_id, source_item_id
     FROM story_post_related_url_projection_receipts
     WHERE post_id = $1 AND generation = 1
     ORDER BY url_id
     LIMIT $2`,
    [seed.posts[1], HARD_MAX],
  )
  assert.equal(rows.length, HARD_MAX)
  return rows
}

function receiptDecisions(
  receipts: readonly { url_id: string; source_item_id: string }[],
): SourceDecision[] {
  return receipts.map(row => ({
    id: row.source_item_id,
    url_id: row.url_id,
    url: 'https://seed-post-url-capacity.example.com/explain',
    is_eligible: true,
  }))
}
