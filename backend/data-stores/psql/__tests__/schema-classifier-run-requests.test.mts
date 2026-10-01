import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import { createTestTopic } from '../../../test-helpers/entities/create-test-entities.mts'
import { createClassifierRunSchemaFixture } from '../../../test-helpers/data-stores/psql/classifier-runs/schema-fixture.mts'
import {
  deleteClassifierRunForSchemaTest,
  deletePostForSchemaTest,
  deleteTopicForSchemaTest,
  insertClassifierRunCandidateForSchemaTest,
  insertClassifierRunRequestForSchemaTest,
  insertPostClassifierLocalOutcomeForSchemaTest,
  readClassifierRunCandidateOrdinalsForSchemaTest,
  readClassifierRunRequestForSchemaTest,
  reviseClassifierRunCandidateForSchemaTest,
  revisePostClassifierLocalOutcomeForSchemaTest,
  settleClassifierRunRequestForSchemaTest,
} from '../../../test-helpers/data-stores/psql/classifier-runs/schema-satellites.mts'
import { getPostClassifierLocalOutcomeFacts } from '../../../test-helpers/data-stores/psql/post-classifier/run-facts.mts'
import { onGracefulShutdown } from '../index.mts'

describe('classifier run request, candidate set and local outcome schema', () => {
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

  it('keeps one settlement per request and settles each content version once', async () => {
    const classifier = await createClassifierFixture()
    const fixture = await createFixture({
      classifierId: classifier.classifierId,
      postId: classifier.postId,
    })
    const requestId = await insertClassifierRunRequestForSchemaTest({
      classifierId: classifier.classifierId,
      postId: classifier.postId,
    })

    await expect(
      insertClassifierRunRequestForSchemaTest({
        classifierId: classifier.classifierId,
        postId: classifier.postId,
      }),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      insertClassifierRunRequestForSchemaTest({
        classifierId: classifier.classifierId,
        postId: classifier.postId,
        inputSha256: Buffer.alloc(32, 9),
        runId: fixture.id,
        noWorkAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      insertClassifierRunRequestForSchemaTest({
        classifierId: classifier.classifierId,
        postId: null,
        rssFeedItemId: null,
        inputSha256: Buffer.alloc(32, 8),
      }),
    ).rejects.toMatchObject({ code: '23514' })

    await settleClassifierRunRequestForSchemaTest(requestId, { noWorkAt: new Date() })
    expect(await readClassifierRunRequestForSchemaTest(requestId)).toMatchObject({
      run_id: null,
      no_work_at: expect.any(Date),
    })
    await expect(
      settleClassifierRunRequestForSchemaTest(requestId, {
        noWorkAt: new Date(),
        staleAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('returns a request to the sweep when its run is deleted, and removes it with its post', async () => {
    const classifier = await createClassifierFixture()
    const fixture = await createFixture({
      classifierId: classifier.classifierId,
      postId: classifier.postId,
    })
    const requestId = await insertClassifierRunRequestForSchemaTest({
      classifierId: classifier.classifierId,
      postId: classifier.postId,
      runId: fixture.id,
    })

    await deleteClassifierRunForSchemaTest(fixture.id)
    expect(await readClassifierRunRequestForSchemaTest(requestId)).toMatchObject({ run_id: null })

    await deletePostForSchemaTest(classifier.postId)
    expect(await readClassifierRunRequestForSchemaTest(requestId)).toBeUndefined()
  })

  it('retains one insert-only local outcome per run and removes it with the run', async () => {
    const classifier = await createClassifierFixture()
    const fixture = await createFixture({ classifierId: classifier.classifierId })

    await insertPostClassifierLocalOutcomeForSchemaTest(fixture.id, classifier.topicId)
    await expect(
      insertPostClassifierLocalOutcomeForSchemaTest(fixture.id, classifier.topicId),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      insertPostClassifierLocalOutcomeForSchemaTest(fixture.id, classifier.topicId, 1.5),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(revisePostClassifierLocalOutcomeForSchemaTest(fixture.id)).rejects.toMatchObject({
      code: '23514',
    })
    expect(await getPostClassifierLocalOutcomeFacts(fixture.id)).toMatchObject({ flagged: true })

    await deleteClassifierRunForSchemaTest(fixture.id)
    expect(await getPostClassifierLocalOutcomeFacts(fixture.id)).toBeNull()
  })

  it('removes a local outcome with its topic and keeps the run receipt', async () => {
    const classifier = await createClassifierFixture()
    const fixture = await createFixture({ classifierId: classifier.classifierId })
    const topic = await createTestTopic()

    await insertPostClassifierLocalOutcomeForSchemaTest(fixture.id, topic.id)
    await deleteTopicForSchemaTest(topic.id)

    expect(await getPostClassifierLocalOutcomeFacts(fixture.id)).toBeNull()
    expect(await fixture.read()).toBeDefined()
  })

  it('captures one insert-only, ordered candidate set per run and drops it with the run or a topic', async () => {
    const classifier = await createClassifierFixture()
    const fixture = await createFixture({ classifierId: classifier.classifierId })
    const [first, second, third] = await Promise.all([1, 2, 3].map(() => createTestTopic({})))

    await insertClassifierRunCandidateForSchemaTest(fixture.id, first!.id, 0)
    await insertClassifierRunCandidateForSchemaTest(fixture.id, second!.id, 1)
    await expect(
      insertClassifierRunCandidateForSchemaTest(fixture.id, first!.id, 2),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      insertClassifierRunCandidateForSchemaTest(fixture.id, third!.id, 1),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      insertClassifierRunCandidateForSchemaTest(fixture.id, third!.id, -1),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      reviseClassifierRunCandidateForSchemaTest(fixture.id, first!.id, 5),
    ).rejects.toMatchObject({ code: '23514' })
    expect(await readClassifierRunCandidateOrdinalsForSchemaTest(fixture.id)).toEqual([
      { topicId: first!.id, ordinal: 0 },
      { topicId: second!.id, ordinal: 1 },
    ])

    await deleteTopicForSchemaTest(second!.id)
    expect(await readClassifierRunCandidateOrdinalsForSchemaTest(fixture.id)).toEqual([
      { topicId: first!.id, ordinal: 0 },
    ])
    await deleteClassifierRunForSchemaTest(fixture.id)
    expect(await readClassifierRunCandidateOrdinalsForSchemaTest(fixture.id)).toEqual([])
  })
})
