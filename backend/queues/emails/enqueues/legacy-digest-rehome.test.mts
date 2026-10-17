import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TestQueue, TestWorker, UnrecoverableError } from 'glide-mq/testing'
import { drainFailedLegacyEmailDigestJobs } from './legacy-digest-rehome.mts'

describe('drainFailedLegacyEmailDigestJobs', () => {
  it('moves a failed digest send off emails and leaves a transactional failure there', async () => {
    const marker = randomUUID()
    const source = new TestQueue(`legacy-emails-${marker}`)
    const target = new TestQueue(`legacy-background-${marker}`)
    const payload = {
      input: { userId: marker, trackingKey: `daily:${marker}` },
      variables: { communities: [] },
    }
    const digest = await source.add('processSendCommunityModerationSummaryEmail', payload, {
      attempts: 1,
    })
    const transactional = await source.add('processSendWelcomeEmail', { marker }, { attempts: 1 })
    if (!digest || !transactional) throw new Error('expected both jobs to be admitted')

    const worker = new TestWorker(source, async () => {
      throw new UnrecoverableError('handler rejected the job')
    })
    try {
      await Promise.all([onceFailed(worker, digest.id), onceFailed(worker, transactional.id)])
      await drainFailedLegacyEmailDigestJobs(source, target)

      const moved = (
        await target.searchJobs({
          name: 'email-digests.processSendCommunityModerationSummaryEmail',
        })
      ).filter(job => readUserId(job.data) === marker)
      expect(moved).toHaveLength(1)
      expect(moved[0]).toMatchObject({
        data: payload,
        opts: { deduplication: { id: `emails:legacy-digest:${digest.id}`, mode: 'simple' } },
      })
      expect(
        await source.searchJobs({
          name: 'processSendCommunityModerationSummaryEmail',
          state: 'failed',
        }),
      ).toEqual([])
      expect(
        (await source.searchJobs({ name: 'processSendWelcomeEmail', state: 'failed' })).filter(
          job => job.id === transactional.id,
        ),
      ).toHaveLength(1)
    } finally {
      await worker.close()
    }
  })
})

function onceFailed(worker: TestWorker, jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let onFailed: (failedJob: { id?: string }) => void
    let onError: (error: Error) => void
    onFailed = failedJob => {
      if (failedJob.id !== jobId) return
      worker.off('failed', onFailed)
      worker.off('error', onError)
      resolve()
    }
    onError = error => {
      worker.off('failed', onFailed)
      worker.off('error', onError)
      reject(error)
    }
    worker.on('failed', onFailed)
    worker.on('error', onError)
  })
}

function readUserId(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null || !('input' in data)) return undefined
  const input = data.input
  if (typeof input !== 'object' || input === null || !('userId' in input)) return undefined
  return typeof input.userId === 'string' ? input.userId : undefined
}
