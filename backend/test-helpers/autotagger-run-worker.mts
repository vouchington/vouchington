import type { ClassifierRunJobData } from '../queues/ai-agents/types.mts'
import { processClassifierRunDispatcher } from '../workers/ai-agents/processors/process-classifier-run.mts'
import {
  classifierRunDispatcherJobFor,
  classifierRunDispatcherJobForFeedItem,
} from './classifier-run-worker.mts'
import {
  requestAutotaggerRun,
  TAGGING_CLASSIFIER_SLUG,
} from './data-stores/psql/classifier-runs/autotagger-fixture.mts'
import { getSubjectClassifierRunFacts } from './data-stores/psql/classifier-runs/run-facts.mts'

type Subject = Parameters<typeof requestAutotaggerRun>[0]

/** The C6 dispatcher job for a subject: a post or an RSS feed item. */
export function autotaggerDispatcherJobFor(subject: Subject['subject']) {
  return subject.postId !== null
    ? classifierRunDispatcherJobFor(subject.postId, TAGGING_CLASSIFIER_SLUG)
    : classifierRunDispatcherJobForFeedItem(subject.rssFeedItemId, TAGGING_CLASSIFIER_SLUG)
}

/** A requested C6 subject, reserved by the real dispatcher and queued, as a sweep would leave it. */
export async function dispatchAutotaggerSubject(fixture: Subject) {
  await requestAutotaggerRun(fixture)
  await processClassifierRunDispatcher(autotaggerDispatcherJobFor(fixture.subject))
  const run = (await getSubjectClassifierRunFacts(fixture.subject, TAGGING_CLASSIFIER_SLUG))[0]
  if (!run) throw new Error('Expected the dispatcher to reserve a tagging run')
  const data: ClassifierRunJobData = {
    classifier: TAGGING_CLASSIFIER_SLUG,
    runId: run.id,
    postId: fixture.subject.postId,
    rssFeedItemId: fixture.subject.rssFeedItemId,
    inputSha256: run.input_sha256.toString('hex'),
    configurationSha256: run.configuration_sha256.toString('hex'),
  }
  return { runId: run.id, data }
}
