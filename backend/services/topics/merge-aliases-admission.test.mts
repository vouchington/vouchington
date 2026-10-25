import { randomUUID } from 'node:crypto'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { holdQueueBulkAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTopicAliases } from './aliases.mts'
import { createTopic } from './create.mts'
import { getTopicByAny } from './get.mts'
import { mergeTopicAliases } from './merge-aliases.mts'

describe('mergeTopicAliases post-commit admission', () => {
  it('waits for alias-update admission after the merge commits', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceSlug = `admission-source-${randomUUID()}`
    const destinationSlug = `admission-destination-${randomUUID()}`
    const source = await createTopic(admin!, WEB_PROVENANCE, {
      name: `Admission source ${sourceSlug}`,
      slug: sourceSlug,
    })
    const destination = await createTopic(admin!, WEB_PROVENANCE, {
      name: `Admission destination ${destinationSlug}`,
      slug: destinationSlug,
    })
    await createTopicAliases(source.id, `admission-alias-${randomUUID()}`)
    const ownedTopicIds = new Set([source.id, destination.id])
    const queueGate = holdQueueBulkAdmission(
      rssFeedMaintenance,
      'processTopicAliasesUpdate',
      data =>
        typeof data === 'object' &&
        data !== null &&
        'topicId' in data &&
        typeof data.topicId === 'string' &&
        ownedTopicIds.has(data.topicId),
    )
    let merge: ReturnType<typeof mergeTopicAliases> | undefined
    let settled = false
    let gateEntered = false
    let cleanupPromise: Promise<void> | undefined
    const cleanup = () => {
      cleanupPromise ??= (async () => {
        queueGate.release()
        try {
          await merge?.catch(() => undefined)
          if (gateEntered) {
            const jobs = await queueGate.admitted.catch(() => null)
            if (jobs) {
              await removeEnqueuedJobs([Promise.resolve(jobs)], 'processTopicAliasesUpdate')
            }
          }
        } finally {
          queueGate.restore()
        }
      })()
      return cleanupPromise
    }
    onTestFinished(cleanup)

    merge = mergeTopicAliases(admin!, source, destination).finally(() => {
      settled = true
    })

    try {
      const firstEvent = await Promise.race([
        queueGate.entered.then(() => 'admission-entered'),
        merge.then(
          () => 'merge-settled',
          () => 'merge-rejected',
        ),
      ])
      expect(firstEvent).toBe('admission-entered')
      gateEntered = true
      expect(await getTopicByAny(source.id)).toMatchObject({ id: destination.id })
      expect(settled).toBe(false)

      queueGate.release()
      const admitted = await queueGate.admitted
      expect(admitted).toHaveLength(2)
      const persisted = await Promise.all(
        admitted.map(job => readEnqueuedJob(rssFeedMaintenance, job)),
      )
      expect(persisted.map(job => (job.data as { topicId: string }).topicId).toSorted()).toEqual(
        [source.id, destination.id].toSorted(),
      )
      await expect(merge).resolves.toMatchObject({
        source_topic_id: source.id,
        destination_topic_id: destination.id,
      })
    } finally {
      await cleanup()
    }
  })

  it('keeps a committed merge when alias-update admission fails and reports it once', async () => {
    const admin = await createTestUser({ administrator: true })
    const sourceSlug = `failure-source-${randomUUID()}`
    const destinationSlug = `failure-destination-${randomUUID()}`
    const source = await createTopic(admin!, WEB_PROVENANCE, {
      name: `Failure source ${sourceSlug}`,
      slug: sourceSlug,
    })
    const destination = await createTopic(admin!, WEB_PROVENANCE, {
      name: `Failure destination ${destinationSlug}`,
      slug: destinationSlug,
    })
    await createTopicAliases(source.id, `failure-alias-${randomUUID()}`)
    const ownedTopicIds = new Set([source.id, destination.id])
    const admissionError = new Error('Injected topic-alias update admission failure')
    const originalAddBulk = rssFeedMaintenance.addBulk
    const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
    let matchingAdmissions = 0
    const addBulkSpy = vi.spyOn(rssFeedMaintenance, 'addBulk').mockImplementation(jobs => {
      if (
        jobs.some(
          job =>
            job.name === 'processTopicAliasesUpdate' &&
            typeof job.data === 'object' &&
            job.data !== null &&
            'topicId' in job.data &&
            typeof job.data.topicId === 'string' &&
            ownedTopicIds.has(job.data.topicId),
        )
      ) {
        matchingAdmissions += 1
        return Promise.reject(admissionError)
      }
      return originalAddBulk.call(rssFeedMaintenance, jobs)
    })

    try {
      await expect(mergeTopicAliases(admin!, source, destination)).resolves.toMatchObject({
        source_topic_id: source!.id,
        destination_topic_id: destination.id,
      })
      expect(await getTopicByAny(source.id)).toMatchObject({ id: destination.id })
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reportedError]) => reportedError === admissionError),
      ).toHaveLength(1)
    } finally {
      addBulkSpy.mockRestore()
    }
  })
})
