import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  findAiUsageRecordById,
  insertTestAiUsageRecord,
} from '../../../test-helpers/entities/ai-usage.mts'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import { getPartitionRows } from '../../../test-helpers/data-stores/psql/election-schema.mts'
import { createClassifierRunSchemaFixture } from '../../../test-helpers/data-stores/psql/classifier-runs/schema-fixture.mts'
import {
  deleteClassifierRunForSchemaTest,
  deletePostForSchemaTest,
} from '../../../test-helpers/data-stores/psql/classifier-runs/schema-satellites.mts'
import { onGracefulShutdown } from '../index.mts'

describe('classifier run schema', () => {
  const fixtures: { dispose: () => Promise<unknown> }[] = []

  async function createFixture(...options: Parameters<typeof createClassifierRunSchemaFixture>) {
    const fixture = await createClassifierRunSchemaFixture(...options)
    fixtures.push(fixture)
    return fixture
  }

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose()))
  })

  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('keeps the receipt, request and local outcome tables unpartitioned', async () => {
    expect(
      await getPartitionRows([
        'classifier_runs',
        'classifier_run_requests',
        'post_classifier_local_outcomes',
      ]),
    ).toEqual([])
  })

  it('fences one receipt per content and configuration identity, and stamps the community', async () => {
    const { classifierId } = await createClassifierFixture()
    const fixture = await createFixture({ classifierId, community: true })

    expect((await fixture.read())?.community_identity_id).toBe(fixture.communityId)
    await expect(fixture.insertRun()).rejects.toMatchObject({ code: '23505' })
    await expect(
      fixture.insertRun({ configurationJson: JSON.stringify({ other: 1 }) }),
    ).resolves.toEqual(expect.any(String))
    await expect(fixture.insertRun({ inputSha256: Buffer.alloc(32, 7) })).resolves.toEqual(
      expect.any(String),
    )
    await expect(fixture.insertRun({ configurationJson: 'not-json' })).rejects.toMatchObject({
      code: '22P02',
    })
    await expect(
      fixture.insertRun({ configurationSha256: Buffer.alloc(32, 2) }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.insertRun({ postId: null })).rejects.toMatchObject({ code: '23514' })
  })

  it('accepts an RSS feed item subject and rejects a receipt with both or neither subject', async () => {
    const classifier = await createClassifierFixture()
    const batch = await classifier.createStoryBatch()
    const fixture = await createFixture({
      classifierId: classifier.storyClassifierId,
      rssFeedItemId: classifier.rssFeedItemId,
      decisionBatchId: batch.batchId,
    })

    expect(await fixture.read()).toMatchObject({
      post_id: null,
      rss_feed_item_id: classifier.rssFeedItemId,
      community_identity_id: null,
    })
    await expect(
      fixture.insertRun({ postId: classifier.postId, rssFeedItemId: classifier.rssFeedItemId }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.insertRun({ rssFeedItemId: null })).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('makes identity, actor, provenance and batch immutable, and restricts the actor', async () => {
    const { classifierId } = await createClassifierFixture()
    const fixture = await createFixture({ classifierId, community: true })

    for (const assignment of [
      { input_sha256: Buffer.alloc(32, 3) },
      { configuration_sha256: Buffer.alloc(32, 4) },
      { shared_actor_user_id: randomUUID() },
      { community_identity_id: randomUUID() },
      { classifier_id: randomUUID() },
      { decision_batch_id: randomUUID() },
    ]) {
      await expect(fixture.update(assignment)).rejects.toMatchObject({ code: '23514' })
    }
    await expect(fixture.deleteActor()).rejects.toMatchObject({ code: '23001' })
  })

  it('references only the same-subject, same-classifier pre-reserved C3 batch', async () => {
    const classifier = await createClassifierFixture()
    const batch = await classifier.createTopicBatch()
    const fixture = await createFixture({
      classifierId: classifier.classifierId,
      postId: classifier.postId,
      decisionBatchId: batch.batchId,
    })

    expect((await fixture.read())?.decision_batch_id).toBe(batch.batchId)
    const unused = await classifier.createTopicBatch()
    await expect(
      createFixture({ classifierId: classifier.classifierId, decisionBatchId: unused.batchId }),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      createFixture({
        classifierId: classifier.storyClassifierId,
        postId: classifier.postId,
        decisionBatchId: unused.batchId,
      }),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      fixture.insertRun({
        configurationJson: JSON.stringify({ again: 1 }),
        decisionBatchId: batch.batchId,
      }),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('cascades a receipt with its C3 batch and its post, and keeps the guards on cleanup', async () => {
    const classifier = await createClassifierFixture()
    const batch = await classifier.createTopicBatch()
    const fixture = await createFixture({
      classifierId: classifier.classifierId,
      postId: classifier.postId,
      decisionBatchId: batch.batchId,
    })

    await classifier.deleteBatch(batch.batchId)
    expect(await fixture.read()).toBeUndefined()

    const other = await createFixture({ classifierId: classifier.classifierId })
    await deletePostForSchemaTest(other.postId!)
    expect(await other.read()).toBeUndefined()
  })

  it.each([
    'provider-error',
    'invalid-result',
    'context-rejected',
    'attempts-exhausted',
    'client-unavailable',
    'sweep-bound-exceeded',
  ])('accepts %s as a terminal failure kind and never clears it', async kind => {
    const { classifierId } = await createClassifierFixture()
    const fixture = await createFixture({ classifierId })

    await expect(
      fixture.update({ terminal_failure_kind: kind, terminal_failed_at: new Date() }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      fixture.update({ terminal_failure_kind: null, terminal_failed_at: null }),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('bounds failure metadata and keeps the attempt and sweep counters monotone', async () => {
    const { classifierId } = await createClassifierFixture()
    const fixture = await createFixture({ classifierId })

    await expect(
      fixture.update({ terminal_failure_kind: 'unknown', terminal_failed_at: new Date() }),
    ).rejects.toMatchObject({ code: '22P02' })
    await expect(fixture.update({ terminal_failure_kind: 'provider-error' })).rejects.toMatchObject(
      { code: '23514' },
    )
    await expect(fixture.update({ provider_attempts_started: -1 })).rejects.toMatchObject({
      code: '23514',
    })
    await fixture.update({ provider_attempts_started: 2, sweep_enqueue_count: 3 })
    await fixture.update({ provider_attempts_started: 2, sweep_enqueue_count: 3 })
    await expect(fixture.update({ provider_attempts_started: 1 })).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.update({ sweep_enqueue_count: 2 })).rejects.toMatchObject({
      code: '23514',
    })
    expect(await fixture.read()).toMatchObject({
      provider_attempts_started: 2,
      sweep_enqueue_count: 3,
    })
  })

  it('keeps a terminal receipt exclusive of completion, and completion behind outcomes', async () => {
    const { classifierId } = await createClassifierFixture()
    const terminal = await createFixture({ classifierId })
    await terminal.update({
      terminal_failure_kind: 'attempts-exhausted',
      terminal_failed_at: new Date(),
    })
    await expect(terminal.update({ completed_at: new Date() })).rejects.toMatchObject({
      code: '23514',
    })

    const fixture = await createFixture({ classifierId })
    await expect(fixture.update({ completed_at: new Date() })).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.update({ lease_token: randomUUID() })).rejects.toMatchObject({
      code: '23514',
    })
    const leasedAt = new Date()
    await fixture.update({
      lease_token: randomUUID(),
      leased_at: leasedAt,
      lease_expires_at: new Date(leasedAt.getTime() + 60_000),
    })
    await expect(fixture.update({ completed_at: new Date() })).rejects.toMatchObject({
      code: '23514',
    })
    await fixture.update({
      lease_token: null,
      leased_at: null,
      lease_expires_at: null,
      outcomes_persisted_at: new Date(),
      completed_at: new Date(),
    })
    await expect(fixture.update({ completed_at: null })).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.update({ outcomes_persisted_at: null })).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('lets a superseded receipt be revived without changing its outcome', async () => {
    const { classifierId } = await createClassifierFixture()
    const fixture = await createFixture({ classifierId })

    await fixture.update({ superseded_at: new Date() })
    await expect(
      fixture.update({ superseded_at: new Date(Date.now() + 1000) }),
    ).rejects.toMatchObject({ code: '23514' })
    await fixture.update({ superseded_at: null })
    expect((await fixture.read())?.superseded_at).toBeNull()
  })

  it('keeps a usage ledger row when its run is deleted, dropping only the attribution', async () => {
    const { classifierId } = await createClassifierFixture()
    const fixture = await createFixture({ classifierId })
    const ledgerId = await insertTestAiUsageRecord({ classifierRunId: fixture.id, latencyMs: 40 })

    await expect(findAiUsageRecordById(ledgerId)).resolves.toEqual({
      classifier_run_id: fixture.id,
      latency_milliseconds: 40,
    })
    await deleteClassifierRunForSchemaTest(fixture.id)

    await expect(findAiUsageRecordById(ledgerId)).resolves.toEqual({
      classifier_run_id: null,
      latency_milliseconds: 40,
    })
  })

  it('rejects a usage ledger row that names no run or a negative latency', async () => {
    await expect(insertTestAiUsageRecord({ classifierRunId: randomUUID() })).rejects.toMatchObject({
      code: '23503',
    })
    await expect(insertTestAiUsageRecord({ latencyMs: -1 })).rejects.toMatchObject({
      code: '23514',
    })
  })
})
