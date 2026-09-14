import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import {
  getFollowerDistributionAudienceConstraint,
  getLifecycleConstraintNames,
  getModerationTrainingTargetConstraint,
  getTerminalLifecycleGuardFunctionDefinition,
  getTerminalLifecycleGuards,
} from '../../../test-helpers/data-stores/psql/lifecycle-integrity-catalog.mts'
import {
  insertActiveBlueskyAuthorizationWithoutHandle,
  insertContradictoryBedrockBatchLifecycle,
  insertContradictoryDataRequestLifecycle,
  insertContradictoryImageLifecycle,
  insertContradictoryRssImportRowLifecycle,
  insertTerminalBlueskyAuthorizationHandle,
  rewriteTerminalAgentResponse,
  rewriteTerminalBedrockBatch,
  rewriteTerminalDataRequest,
  rewriteTerminalImage,
  rewriteTerminalRssImportBatch,
} from '../../../test-helpers/data-stores/psql/lifecycle-integrity-mutations.mts'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'

const lifecycleConstraints = [
  'admin_import_batches.chk_admin_import_batches__lifecycle',
  'admin_import_rows.chk_admin_import_rows__lifecycle',
  'bedrock_embeddings_batches.chk_bedrock_embeddings_batches__lifecycle',
  'follower_distributions.chk_follower_distributions__audience_selection',
  'images.chk_images__upload_lifecycle',
  'moderation_training_feedbacks.chk_moderation_training_feedbacks__targets',
  'user_data_requests.chk_user_data_requests__lifecycle',
  'user_rss_feed_import_batches.chk_user_rss_feed_import_batches__lifecycle',
  'user_rss_feed_import_rows.chk_user_rss_feed_import_rows__lifecycle',
] as const

const guardedLifecycleColumns = {
  agent_responses: ['completed_at', 'failed_at'],
  admin_import_batches: ['completed_at'],
  admin_import_rows: ['completed_at', 'failed_at'],
  bedrock_embeddings_batches: ['completed_at', 'failed_at', 'cancelled_at'],
  images: ['upload_completed_at', 'upload_failed_at'],
  user_data_requests: ['completed_at', 'failed_at'],
  user_rss_feed_import_batches: ['completed_at'],
  user_rss_feed_import_rows: ['completed_at', 'failed_at'],
} as const

describe('PostgreSQL lifecycle integrity', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('installs lifecycle checks for asynchronous work tables', async () => {
    const installed = new Set(
      await getLifecycleConstraintNames([
        ...new Set(lifecycleConstraints.map(name => name.split('.')[0]!)),
      ]),
    )
    expect(lifecycleConstraints.filter(name => !installed.has(name))).toEqual([])
  })

  it('guards terminal lifecycle timestamps from being cleared or switched', async () => {
    const rows = await getTerminalLifecycleGuards(Object.keys(guardedLifecycleColumns))

    expect(rows.map(row => row.tableName)).toEqual(Object.keys(guardedLifecycleColumns).toSorted())
    for (const row of rows) {
      const columns = guardedLifecycleColumns[row.tableName as keyof typeof guardedLifecycleColumns]
      for (const column of columns) expect(row.triggerDefinition).toContain(`'${column}'`)
    }

    expect(await getTerminalLifecycleGuardFunctionDefinition()).toContain('IS DISTINCT FROM')
  })

  it('rejects contradictory lifecycle inserts', async () => {
    const user = await createLocalTestUser()
    await expect(insertContradictoryImageLifecycle(user.id)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(insertContradictoryDataRequestLifecycle()).rejects.toMatchObject({ code: '23514' })
    await expect(insertContradictoryBedrockBatchLifecycle()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(insertContradictoryRssImportRowLifecycle(user.id)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('requires Bluesky authorization handles exactly while lifecycle state is active', async () => {
    const user = await createLocalTestUser()
    await expect(insertTerminalBlueskyAuthorizationHandle(user.id)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(insertActiveBlueskyAuthorizationWithoutHandle(user.id)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('rejects rewrites after asynchronous work reaches a terminal state', async () => {
    const user = await createLocalTestUser()
    await expect(rewriteTerminalAgentResponse(user.id)).rejects.toMatchObject({ code: '23514' })
    await expect(rewriteTerminalImage(user.id)).rejects.toMatchObject({ code: '23514' })
    await expect(rewriteTerminalDataRequest()).rejects.toMatchObject({ code: '23514' })
    await expect(rewriteTerminalBedrockBatch()).rejects.toMatchObject({ code: '23514' })
    await expect(rewriteTerminalRssImportBatch(user.id)).rejects.toMatchObject({ code: '23514' })
  })

  it('bounds selected follower distribution recipients in the database', async () => {
    expect(await getFollowerDistributionAudienceConstraint()).toContain(
      'cardinality(selected_recipient_user_ids) <= 100',
    )
  })

  it('binds moderation feedback source-specific targets', async () => {
    const definition = await getModerationTrainingTargetConstraint()
    expect(definition).toContain("source_type = 'moderation_report'")
    expect(definition).toContain('moderation_report_id IS NOT NULL')
    expect(definition).toContain("source_type = 'moderation_appeal'")
    expect(definition).toContain('moderation_appeal_id IS NOT NULL')
    expect(definition).toContain("source_type = 'review_dispute'")
    expect(definition).toContain('review_dispute_id IS NOT NULL')
  })
})
