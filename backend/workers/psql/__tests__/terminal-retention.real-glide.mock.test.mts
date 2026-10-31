import { DelayedError } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createScopedTerminalRetentionProcessorForTest } from '@voucha/test-helpers/terminal-retention-processor'
import { dataRetentionConfig } from '@services/data-retention/config'
import { enqueueTerminalActivityRetention } from '@queues/psql/enqueues/activitypub-terminal-retention'
import { psql } from '@queues/psql/queues'
import type { TerminalActivityRetentionData } from '@queues/psql/types'
import { createTerminalActivityRetentionProcessor } from '../processors/activitypub-terminal-retention.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const terminalFamilies = {
  follow: 'follow',
  like: 'like',
} as const satisfies Record<
  TerminalActivityRetentionData['family'],
  TerminalActivityRetentionData['family']
>

function terminalJobId(family: TerminalActivityRetentionData['family']): string {
  return `psql__terminal_activity_retention__${family}`
}

async function requireTerminalJob(family: TerminalActivityRetentionData['family']) {
  const job = await psql.getJob(terminalJobId(family))
  if (!job) throw new Error(`missing terminal retention job for ${family}`)
  return job
}

function terminalProcessorJob(
  job: Awaited<ReturnType<typeof requireTerminalJob>>,
): Parameters<ReturnType<typeof createTerminalActivityRetentionProcessor>>[0] {
  const data: unknown = job.data
  if (typeof data !== 'object' || data === null || !('family' in data)) {
    throw new Error('missing terminal retention family')
  }
  if (data.family !== 'follow' && data.family !== 'like') {
    throw new Error('missing terminal retention family')
  }
  // moveToDelayed yields only after a worker has marked the job active.
  job.entryId = '0-0'
  return {
    data: { family: data.family },
    updateData: next => job.updateData(next),
    moveToDelayed: timestamp => job.moveToDelayed(timestamp),
  }
}

async function runFetchedTerminalProcessor(
  family: TerminalActivityRetentionData['family'],
  process: ReturnType<typeof createTerminalActivityRetentionProcessor>,
): Promise<void> {
  try {
    await process(terminalProcessorJob(await requireTerminalJob(family)))
  } catch (err) {
    if (err instanceof DelayedError) return
    throw err
  }
}

function removeTerminalJobOnFinish(family: TerminalActivityRetentionData['family']): void {
  onTestFinished(async () => {
    const job = await psql.getJob(terminalJobId(family))
    if (job) await job.remove()
  })
}

describe('terminal identity family native admission', () => {
  it.each(Object.values(terminalFamilies))(
    'keeps the waiting %s job and admits it again only after that record is gone',
    async family => {
      removeTerminalJobOnFinish(family)
      const existing = await psql.getJob(terminalJobId(family))
      if (existing) await existing.remove()

      const admitted = await enqueueTerminalActivityRetention([family])
      expect(admitted.map(job => job.id)).toEqual([terminalJobId(family)])
      const job = await requireTerminalJob(family)
      expect(job.data).toEqual({ family })
      expect(job.attemptsMade).toBe(0)
      expect(job.opts).toMatchObject({
        priority: 10,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000, jitter: 0.5 },
        ordering: { key: `psql:terminal-activity-retention:${family}`, concurrency: 1 },
      })
      await expect(enqueueTerminalActivityRetention([family])).resolves.toEqual([])

      await job.remove()
      const readmitted = await enqueueTerminalActivityRetention([family])
      expect(readmitted.map(item => item.id)).toEqual([terminalJobId(family)])
    },
  )

  it('leaves the fetched follow job unattempted when its processor throws', async () => {
    removeTerminalJobOnFinish('follow')
    const existing = await psql.getJob(terminalJobId('follow'))
    if (existing) await existing.remove()
    const process = createTerminalActivityRetentionProcessor(() => {
      throw new Error('transient terminal retention failure')
    })
    await enqueueTerminalActivityRetention(['follow'])
    const job = await requireTerminalJob('follow')
    await expect(process(terminalProcessorJob(job))).rejects.toThrow(
      'transient terminal retention failure',
    )
    expect((await requireTerminalJob('follow')).attemptsMade).toBe(0)
  })

  it('drains scoped follow pages by calling the processor on the fetched job', async () => {
    removeTerminalJobOnFinish('follow')
    const existing = await psql.getJob(terminalJobId('follow'))
    if (existing) await existing.remove()
    const fixture = await createScopedTerminalRetentionProcessorForTest()
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })
    onTestFinished(restore)
    await enqueueTerminalActivityRetention(['follow'])
    await runFetchedTerminalProcessor('follow', fixture.process)
    expect((await requireTerminalJob('follow')).attemptsMade).toBe(0)
    await runFetchedTerminalProcessor('follow', fixture.process)
    await runFetchedTerminalProcessor('follow', fixture.process)
    expect(fixture.pages).toEqual([
      { deleted: 1, hasMore: true },
      { deleted: 1, hasMore: true },
      { deleted: 0, hasMore: false },
    ])
    expect((await requireTerminalJob('follow')).attemptsMade).toBe(0)
  })
})
