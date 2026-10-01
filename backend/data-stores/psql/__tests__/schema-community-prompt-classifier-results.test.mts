import { afterAll, describe, expect, it } from 'vitest'
import { createClassifierCommunityPromptFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import { insertTestCommunity } from '../../../test-helpers/entities/communities.mts'
import { onGracefulShutdown } from '../index.mts'

describe('community prompt classifier result storage', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('stores one precise result per community prompt in a community-scoped post batch', async () => {
    const fixture = await createClassifierCommunityPromptFixture()
    const lineage = await fixture.createCommunityPromptBatch()

    await expect(
      fixture.insertCommunityPromptResult({ ...lineage, probability: 0.75004 }),
    ).resolves.toMatchObject({ rows: [{ probability: '0.75004' }] })
    await expect(fixture.insertCommunityPromptResult(lineage)).rejects.toMatchObject({
      code: '23505',
    })
    await expect(fixture.getDecisionPersistenceFacts(lineage.batchId)).resolves.toMatchObject({
      batches: 1,
      calls: 1,
      snapshots: 0,
      topic_results: 0,
      story_results: 0,
      community_prompt_results: 1,
    })
  })

  it('rejects a prompt that belongs to a different community than the batch scope', async () => {
    const fixture = await createClassifierCommunityPromptFixture()
    const other = await insertTestCommunity({ createdById: fixture.auditUserId })
    const lineage = await fixture.createCommunityPromptBatch({ communityId: other.id })

    await expect(
      fixture.insertCommunityPromptResult({ ...lineage, communityId: other.id }),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(fixture.countCommunityPromptResults(lineage.batchId)).resolves.toBe(0)
  })

  it('rejects thresholds that differ from the prompt revision defaults', async () => {
    const fixture = await createClassifierCommunityPromptFixture()
    const lineage = await fixture.createCommunityPromptBatch()

    await expect(
      fixture.insertCommunityPromptResult({ ...lineage, effectiveLower: 0.2 }),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects a result on a batch whose subject is not a post', async () => {
    const fixture = await createClassifierCommunityPromptFixture()
    const lineage = await fixture.createCommunityPromptRssBatch()

    await expect(fixture.insertCommunityPromptResult(lineage)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('keeps results append-only', async () => {
    const fixture = await createClassifierCommunityPromptFixture()
    const lineage = await fixture.createCommunityPromptBatch()
    await fixture.insertCommunityPromptResult(lineage)

    await expect(
      fixture.updateCommunityPromptResultProbability(lineage.batchId),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('cascades results with the batch, the prompt and the community', async () => {
    const batchFixture = await createClassifierCommunityPromptFixture()
    const batchLineage = await batchFixture.createCommunityPromptBatch()
    await batchFixture.insertCommunityPromptResult(batchLineage)
    await batchFixture.deleteBatch(batchLineage.batchId)
    await expect(batchFixture.countCommunityPromptResults(batchLineage.batchId)).resolves.toBe(0)

    const promptFixture = await createClassifierCommunityPromptFixture()
    const promptLineage = await promptFixture.createCommunityPromptBatch()
    await promptFixture.insertCommunityPromptResult(promptLineage)
    await promptFixture.deleteCommunityPrompt()
    await expect(promptFixture.countCommunityPromptResults(promptLineage.batchId)).resolves.toBe(0)

    const communityFixture = await createClassifierCommunityPromptFixture()
    const communityLineage = await communityFixture.createCommunityPromptBatch()
    await communityFixture.insertCommunityPromptResult(communityLineage)
    await communityFixture.deleteCommunity()
    await expect(
      communityFixture.countCommunityPromptResults(communityLineage.batchId),
    ).resolves.toBe(0)
  })
})
