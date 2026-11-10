import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { rollbackPostImages } from '@services/posts/images-rollback'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runImageCapacityConditionalWrites(): Promise<void> {
  const postId = seedUuid(900_000, 'bb')
  await write(
    `/* seedCapacityRollbackOwner */ INSERT INTO posts
      (id, created_by_id, post_type, title, markdown, created_via,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    VALUES ($1::uuid, $2::uuid, 'discussion', 'Capacity rollback owner', '', 'system',
      decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex'))
    ON CONFLICT (id) DO NOTHING`,
    [postId, seedUuid(900_000, 'b8')],
  )
  registerScenarioContract('image-placement-rollback-owner', {
    allowEmptyResult: true,
    // The keyed scan and its ModifyTable target each account for the same one owner row.
    expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 2 }],
    forbidSequentialScans: ['posts'],
  })
  await runAndCapture(
    'image-placement-rollback-owner',
    async () => {
      assert.equal(
        await rollbackPostImages(postId, {
          revisionId: seedUuid(900_000, 'bc'),
          currentImages: [],
          images: [],
          currentLlmModerationContentSha256: Buffer.alloc(32),
          llmModerationContentSha256: Buffer.alloc(32),
          currentClearanceVersion: '0',
          clearanceVersion: '0',
          approvedAt: null,
          rejectedAt: null,
          inReviewAt: null,
          clearanceChangedById: null,
          clearancePublicReasonCode: null,
          clearancePrivateNote: null,
          clearancePlatformOverride: false,
        }),
        true,
      )
    },
    undefined,
    'rollbackPostImages:restoreOwner',
  )
}
