import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect } from 'vitest'
import { write } from '@data-stores/psql'
import { rejectNextClassifierRunDispatcherAddForTest } from './injected-failures.mts'
import { followTopicAsReader } from './data-stores/psql/classifier-runs/autotagger-agent-fixture.mts'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import type { ClassifierRunJobData } from '../queues/ai-agents/types.mts'
import { spendCapConfig } from '../services/ai-usage/index.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'
import { requestClassifierRuns } from '../services/classifier-runs/index.mts'
import {
  processClassifierRun,
  processClassifierRunDispatcher,
} from '../workers/ai-agents/processors/process-classifier-run.mts'
import type { ClassifierRunHandler } from '../workers/ai-agents/processors/classifier-run-handler.mts'
import {
  getClassifierRunFacts,
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from './data-stores/psql/classifier-runs/run-facts.mts'
import {
  createAutotaggerPostFixture,
  TAGGING_CLASSIFIER_SLUG,
} from './data-stores/psql/classifier-runs/autotagger-fixture.mts'
import {
  readClassifierRunJobsForTest,
  readClassifierRunDispatcherJobsForTest,
} from './classifier-run-queue-jobs.mts'
import {
  createApprovedClassifierPost,
  requestPostClassifierRun,
} from './data-stores/psql/post-classifier/execution.mts'

export { POST_CLASSIFIER_SLUG, requestPostClassifierRun }

type DispatcherJob = Parameters<typeof processClassifierRunDispatcher>[0]
type RunJob = Parameters<typeof processClassifierRun>[0]
export function classifierRunDispatcherJobFor(postId: string, classifier = POST_CLASSIFIER_SLUG) {
  return {
    id: randomUUID(),
    name: 'classifier-run-dispatcher',
    data: { classifier, postId, rssFeedItemId: null },
  } as DispatcherJob
}

export function classifierRunDispatcherJobForFeedItem(rssFeedItemId: string, classifier: string) {
  return {
    id: randomUUID(),
    name: 'classifier-run-dispatcher',
    data: { classifier, postId: null, rssFeedItemId },
  } as DispatcherJob
}

export function classifierRunJobFor(data: ClassifierRunJobData) {
  return { id: randomUUID(), name: 'classifier-run', data } as RunJob
}

/** An approved post whose request was written, reserved by the real dispatcher and queued. */
export async function dispatchApprovedClassifierPost(remote: boolean) {
  const setup = await createApprovedClassifierPost(remote, true)
  await requestPostClassifierRun(setup.post, setup.inputSha256)
  await processClassifierRunDispatcher(classifierRunDispatcherJobFor(setup.post.id))
  const run = (await getClassifierRunFacts(setup.post.id, POST_CLASSIFIER_SLUG))[0]
  if (!run) throw new Error('Expected the dispatcher to reserve a classifier run')
  const data: ClassifierRunJobData = {
    classifier: POST_CLASSIFIER_SLUG,
    runId: run.id,
    postId: setup.post.id,
    rssFeedItemId: null,
    inputSha256: run.input_sha256.toString('hex'),
    configurationSha256: run.configuration_sha256.toString('hex'),
  }
  return { ...setup, runId: run.id, data }
}

/** Eligible neighbors that expose a sweep escaping its owned subject/run ids. */
export async function createTestClassifierSweepNeighbor(handler: ClassifierRunHandler) {
  async function requestedSubject() {
    const fixture =
      handler.slug === POST_CLASSIFIER_SLUG
        ? await createApprovedClassifierPost(true, true)
        : await createAutotaggerPostFixture()
    const subject = { postId: fixture.post.id, rssFeedItemId: null } as const
    await requestClassifierRuns(write, {
      subject,
      inputSha256: fixture.inputSha256,
      classifierSlugs: [handler.slug],
    })
    return subject
  }
  const runSubject = await requestedSubject()
  const reserved = await handler.reserve(runSubject)
  if (reserved.kind !== 'reserved')
    throw new Error(`Unexpected neighbor reservation: ${reserved.kind}`)
  const pendingSubject = await requestedSubject()
  const beforeRun = await getSubjectClassifierRunFacts(runSubject, handler.slug)
  const beforeRequest = await getSubjectClassifierRunRequestFacts(pendingSubject, handler.slug)
  expect(beforeRun).toMatchObject([{ sweep_enqueue_count: 0, terminal_failure_kind: null }])
  expect(beforeRequest).toMatchObject([{ run_identity_id: null, stale_at: null, no_work_at: null }])
  return {
    runId: reserved.run.runId,
    runSubject,
    pendingSubject,
    async assertUnchanged() {
      expect(await getSubjectClassifierRunFacts(runSubject, handler.slug)).toEqual(beforeRun)
      expect(await getSubjectClassifierRunRequestFacts(pendingSubject, handler.slug)).toEqual(
        beforeRequest,
      )
      expect(await readClassifierRunJobsForTest(reserved.run.runId)).toEqual([])
      expect(await readClassifierRunDispatcherJobsForTest(pendingSubject.postId)).toEqual([])
    },
  }
}

/** Plain ownership parameters; every discovery and health read uses the real service. */
export function createClassifierRunSweepScope(realHandler: ClassifierRunHandler) {
  let restoreSpendCap: (() => void) | undefined
  let neighbor: Awaited<ReturnType<typeof createTestClassifierSweepNeighbor>> | undefined
  beforeEach(async () => {
    await spendCapConfig.waitForInitialization()
    restoreSpendCap = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    if ([POST_CLASSIFIER_SLUG, TAGGING_CLASSIFIER_SLUG].includes(realHandler.slug))
      neighbor = await createTestClassifierSweepNeighbor(realHandler)
  })
  afterEach(async () => {
    try {
      await neighbor?.assertUnchanged()
    } finally {
      neighbor = undefined
      restoreSpendCap?.()
      restoreSpendCap = undefined
    }
  })
  const postIds = new Set<string>()
  const rssFeedItemIds = new Set<string>()
  const runIds = new Set<string>()
  return {
    postIds,
    rssFeedItemIds,
    runIds,
    track(post: { id: string }, runId: string) {
      postIds.add(post.id)
      runIds.add(runId)
    },
    trackFeedItem(rssFeedItemId: string, runId: string) {
      rssFeedItemIds.add(rssFeedItemId)
      runIds.add(runId)
    },
    reset() {
      postIds.clear()
      rssFeedItemIds.clear()
      runIds.clear()
    },
    ids() {
      return {
        runIds: [...runIds],
        postIds: [...postIds],
        rssFeedItemIds: [...rssFeedItemIds],
        classifierSlugs: [realHandler.slug],
      }
    },
  }
}

/** Complete a classifier run while its first dispatcher admission fails, restoring the queue afterward. */
export async function expectClassifierRunDispatcherAddFailure(operation: () => Promise<unknown>) {
  const restore = rejectNextClassifierRunDispatcherAddForTest(new Error('queue unavailable'))
  try {
    await expect(operation()).rejects.toThrow('queue unavailable')
  } finally {
    restore()
  }
}

/** Snapshot the unsettled request left behind by failed dispatcher admission. */
export async function readTestUnsettledClassifierRequest(
  subject: { postId: string; rssFeedItemId: null } | { postId: null; rssFeedItemId: string },
  classifier: string,
) {
  const requests = await getSubjectClassifierRunRequestFacts(subject, classifier)
  expect(requests).toMatchObject([{ run_identity_id: null, stale_at: null, no_work_at: null }])
  return requests
}

/** A classifier subject whose topic universe is followed by a paying reader. */
export async function createFollowedClassifierSubjectFixture<
  T extends { topics: Array<{ id: string }> },
>(create: () => Promise<T>): Promise<T> {
  const fixture = await create()
  await Promise.all(fixture.topics.map(topic => followTopicAsReader(topic.id)))
  return fixture
}
