import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  classifierRunDispatcherJobFor,
  classifierRunJobFor,
  dispatchApprovedClassifierPost,
  requestPostClassifierRun,
  POST_CLASSIFIER_SLUG,
} from '@voucha/test-helpers/classifier-run-worker'
import {
  readClassifierRunDispatcherJobsForTest,
  readClassifierRunJobsForTest,
} from '@voucha/test-helpers/classifier-run-queue-jobs'
import {
  getClassifierRunFacts,
  getClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  createApprovedClassifierPost,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import { setTestPostClearanceStatus } from '@voucha/test-helpers/entities/post-clearance'
import { processAIAgent } from '../processors.mts'
import { processClassifierRun } from './process-classifier-run.mts'

const runsOf = (postId: string) => getClassifierRunFacts(postId, POST_CLASSIFIER_SLUG)

describe('classifier run dispatcher', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('reserves an approved post once and queues one stable-id job however often it runs', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    await requestPostClassifierRun(post, inputSha256)

    await expect(processAIAgent(classifierRunDispatcherJobFor(post.id))).resolves.toEqual({
      kind: 'enqueued',
    })
    await expect(processAIAgent(classifierRunDispatcherJobFor(post.id))).resolves.toEqual({
      kind: 'enqueued',
    })

    const runs = await runsOf(post.id)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ decision_batch_id: expect.any(String) })
    const jobs = await readClassifierRunJobsForTest(runs[0]!.id)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toMatchObject({
      classifier: POST_CLASSIFIER_SLUG,
      postId: post.id,
      rssFeedItemId: null,
      inputSha256: inputSha256.toString('hex'),
    })
    expect(await getClassifierRunRequestFacts(post.id)).toMatchObject([{ run_id: runs[0]!.id }])
  })

  it('reserves nothing for an unapproved post and settles its request stale until re-approval re-arms it', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost(true, true)
    await requestPostClassifierRun(post, inputSha256)
    await setTestPostClearanceStatus(post.id, 'pending')

    await expect(processAIAgent(classifierRunDispatcherJobFor(post.id))).resolves.toEqual({
      kind: 'stale',
    })

    expect(await runsOf(post.id)).toEqual([])
    expect(await getClassifierRunRequestFacts(post.id)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: expect.any(Date) },
    ])

    await requestPostClassifierRun(post, inputSha256)
    expect(await getClassifierRunRequestFacts(post.id)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: null },
    ])
  })

  it('settles a request as no work when no classification is configured', async () => {
    const { post, inputSha256 } = await createApprovedClassifierPost(false, false)
    await requestPostClassifierRun(post, inputSha256)

    await expect(processAIAgent(classifierRunDispatcherJobFor(post.id))).resolves.toEqual({
      kind: 'no-work',
    })

    expect(await runsOf(post.id)).toEqual([])
    expect(await getClassifierRunRequestFacts(post.id)).toMatchObject([
      { run_id: null, no_work_at: expect.any(Date) },
    ])
  })

  it('rejects a malformed subject and an unregistered classifier', async () => {
    const both = classifierRunDispatcherJobFor(randomUUID())
    both.data.rssFeedItemId = randomUUID()

    await expect(processAIAgent(both)).resolves.toEqual({ kind: 'stale' })
    await expect(
      processAIAgent(classifierRunDispatcherJobFor(randomUUID(), 'unregistered-classifier')),
    ).rejects.toThrow('No classifier run handler is registered for unregistered-classifier')
    expect(await readClassifierRunDispatcherJobsForTest(both.data.postId!)).toEqual([])
  })
})

describe('classifier run job', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => release?.())

  it('runs a local-only run without a provider attempt and replays it after completion', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')
    const { post, data, runId } = await dispatchApprovedClassifierPost(false)

    await expect(processAIAgent(classifierRunJobFor(data))).resolves.toMatchObject({
      kind: 'completed',
    })
    await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
      kind: 'replay',
    })

    expect(await runsOf(post.id)).toMatchObject([
      { id: runId, provider_attempts_started: 0, completed_at: expect.any(Date) },
    ])
  })

  it('skips a job for a run that does not exist, without effects', async () => {
    const { post, data, runId } = await dispatchApprovedClassifierPost(false)

    await expect(
      processClassifierRun(classifierRunJobFor({ ...data, runId: randomUUID() })),
    ).resolves.toEqual({ kind: 'stale' })

    expect(await runsOf(post.id)).toMatchObject([
      { id: runId, outcomes_persisted_at: null, completed_at: null, superseded_at: null },
    ])
  })

  it('rejects a job that contradicts its durable run and skips one whose approval was withdrawn', async () => {
    const { post, data } = await dispatchApprovedClassifierPost(false)

    await expect(
      processClassifierRun(
        classifierRunJobFor({ ...data, configurationSha256: Buffer.alloc(32, 9).toString('hex') }),
      ),
    ).rejects.toThrow('classifier run identity does not match its snapshot')
    await setTestPostClearanceStatus(post.id, 'pending')
    await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
      kind: 'stale',
    })

    expect((await runsOf(post.id))[0]).toMatchObject({
      provider_attempts_started: 0,
      outcomes_persisted_at: null,
      completed_at: null,
    })
  })

  it('supersedes a run whose configuration changed and queues the current one', async () => {
    const { community, post, data, runId } = await dispatchApprovedClassifierPost(true)
    await setPostClassifierToggleForTest(community.id, 'self-promotion', false)

    await expect(processClassifierRun(classifierRunJobFor(data))).resolves.toEqual({
      kind: 'stale',
    })

    const runs = await runsOf(post.id)
    expect(runs).toHaveLength(2)
    const replacement = runs.find(run => run.id !== runId)!
    expect(runs.find(run => run.id === runId)?.superseded_at).toBeInstanceOf(Date)
    expect(replacement).toMatchObject({ superseded_at: null, completed_at: null })
    const [job] = await readClassifierRunJobsForTest(replacement.id)
    expect(job?.data).toMatchObject({ postId: post.id, runId: replacement.id })
    expect(job?.data).not.toMatchObject({ configurationSha256: data.configurationSha256 })
  })
})
