import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { mediaDeliverySafetyWorkMaxValues } from '@services/media-delivery-safety/work-limits'
import { writeImageDeliveryPolicyMutation } from '@services/media-delivery-safety/image-policy-mutation'
import { rollbackPostImages } from '@services/posts/images-rollback'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { IMAGE_PLACEMENT_CAPACITY_CORPUS } from '../seed-data/image-placement-capacity.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runImageCapacityConditionalWrites(imageId: string): Promise<void> {
  await capturePolicy(imageId, false)
  await capturePolicy(imageId, true)
  await captureRollbackOwner()
}

async function captureRollbackOwner(): Promise<void> {
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

async function capturePolicy(imageId: string, writes: boolean): Promise<void> {
  const cap = mediaDeliverySafetyWorkMaxValues.max_placements_per_image
  const bindings = 'retained_image_placement_bindings'
  const placements = 'media_placements'
  const id = writes
    ? 'image-placement-capacity-policy-writes'
    : 'image-placement-capacity-policy-reads'
  // Writes account for both target lookup and ModifyTable; each changes at most cap records.
  const bound = writes ? 2 * cap : cap
  registerScenarioContract(id, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: bindings, max: bound },
      { kind: 'maxProcessedRows', relation: placements, max: bound },
      { kind: 'maxProcessedRows', relation: 'images', max: 1 },
    ],
    forbidSequentialScans: [bindings, placements, 'images'],
    seededRows: {
      [bindings]: IMAGE_PLACEMENT_CAPACITY_CORPUS,
      [placements]: IMAGE_PLACEMENT_CAPACITY_CORPUS,
    },
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    () =>
      writeImageDeliveryPolicyMutation(query, imageId, scope =>
        scope(
          `/* seedCapacityPolicyTransition */ UPDATE images
      SET upload_started_at = CURRENT_TIMESTAMP, upload_completed_at = CURRENT_TIMESTAMP,
        is_flagged_by_openai_omni_moderation = false,
        openai_omni_moderation_results = '{}'::jsonb,
        openai_omni_moderation_created_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid`,
          [imageId],
        ),
      ),
    undefined,
    writes
      ? ['writeImagePolicy:placements']
      : ['writeImagePolicy:current', 'writeImagePolicy:denials'],
    { afterCapture: () => query.rollback() },
  )
}
