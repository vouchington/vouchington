import { randomUUID } from 'node:crypto'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { holdQueueBulkAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import {
  getTopicMergeAdmissionCheckpoint,
  type TopicMergeAdmissionCheckpoint,
} from '@voucha/test-helpers/topic-merge-admission'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTopicAliases } from './aliases.mts'
import { createTopic } from './create.mts'
import { getTopicByAny } from './get.mts'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import { createTopicMergeOperation, getTopicMergeOperation } from './merge-operations.mts'
import { processTopicMergeOperationPage } from './merge-operation-page.mts'

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

  it('retries the same effects page after alias-update admission fails', async () => {
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
    let matchingAdmissions = 0
    let admittedJobs: Awaited<ReturnType<typeof rssFeedMaintenance.addBulk>> | null = null
    const addBulkSpy = vi.spyOn(rssFeedMaintenance, 'addBulk').mockImplementation(async jobs => {
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
        if (matchingAdmissions === 1) throw admissionError
        admittedJobs = await originalAddBulk.call(rssFeedMaintenance, jobs)
        return admittedJobs
      }
      return originalAddBulk.call(rssFeedMaintenance, jobs)
    })

    try {
      const operation = await createTopicMergeOperation(admin!, source, destination)
      let generation: number | null = 0
      let failedGeneration: number | null = null
      let beforeFailure: TopicMergeAdmissionCheckpoint | null = null
      let pageError: unknown = null
      for (let page = 0; page < 2000 && generation !== null; page++) {
        const before = await getTopicMergeAdmissionCheckpoint(operation.id)
        let next: number | null
        try {
          next = await processTopicMergeOperationPage(operation.id, generation)
        } catch (err) {
          pageError = err
          failedGeneration = generation
          beforeFailure = before
          break
        }
        if (next === null) throw new Error('Merge completed before alias-update admission')
        generation = next
      }
      expect(pageError).toBe(admissionError)
      expect(failedGeneration).not.toBeNull()
      expect(beforeFailure).toMatchObject({ stage: 'effects', completed_at: null })
      expect(await getTopicMergeAdmissionCheckpoint(operation.id)).toEqual(beforeFailure)
      await expect(getTopicMergeOperation(admin!, source.id, operation.id)).resolves.toMatchObject({
        status: 'running',
        stage: 'effects',
      })
      expect(await getTopicByAny(source.id)).toMatchObject({ id: destination.id })
      expect(matchingAdmissions).toBe(1)
      generation = await processTopicMergeOperationPage(operation.id, failedGeneration!)
      for (let page = 0; page < 2000 && generation !== null; page++) {
        generation = await processTopicMergeOperationPage(operation.id, generation)
      }
      expect(generation).toBeNull()
      expect(matchingAdmissions).toBe(2)
      await expect(getTopicMergeOperation(admin!, source.id, operation.id)).resolves.toMatchObject({
        status: 'completed',
      })
    } finally {
      addBulkSpy.mockRestore()
      if (admittedJobs)
        await removeEnqueuedJobs([Promise.resolve(admittedJobs)], 'processTopicAliasesUpdate')
    }
  })
})
