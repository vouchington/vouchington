import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { runCopyrightOperationalRetentionCleanup } from '@services/data-retention'
import { enqueueDataRetentionCleanupContinuation } from '@queues/psql/enqueues'
import { psql } from '@queues/psql/queues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import processPsql from '../processors.mts'

describe('copyright retention continuation', () => {
  it('reuses an admitted child after enqueue failure and drains only pending families', async () => {
    const runId = randomUUID()
    const copyrightIds = [1, 2, 3].map(step => `data-retention-copyright__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(copyrightIds.map(async id => (await psql.getJob(id))?.remove()))
    })
    const initial = await enqueueDataRetentionCleanupContinuation({
      runId,
      step: 1,
      activeClassifierSweeps: [],
      activeMembershipFamilies: [],
      copyrightFamilies: ['copyrightFormScreeningAttempts', 'copyrightActionAttempts'],
    })
    const first = await psql.getJob(copyrightIds[0]!)
    expect(initial[0]?.id).toBe(first?.id)
    expect(first?.opts).toMatchObject({ ordering: { key: 'data_retention:cleanup' } })
    const copyrightCleanup = vi
      .fn<typeof runCopyrightOperationalRetentionCleanup>()
      .mockImplementation(async options => {
        const activeFamilies = options?.activeFamilies
        if (activeFamilies?.includes('copyrightFormScreeningAttempts')) {
          return {
            copyrightFormScreeningAttempts: { scanned: 0, deleted: 0, hasMore: false },
            copyrightActionAttempts: { scanned: 1, deleted: 1, hasMore: true },
          }
        }
        return { copyrightActionAttempts: { scanned: 0, deleted: 0, hasMore: false } }
      })
    let failAfterAdmission = true
    const enqueue = vi.fn<typeof enqueueDataRetentionCleanupContinuation>(async data => {
      const admitted = await enqueueDataRetentionCleanupContinuation(data)
      if (failAfterAdmission) {
        failAfterAdmission = false
        throw new Error('enqueue acknowledgement failed')
      }
      return admitted
    })
    const dependencies = {
      copyrightRetentionCleanup: copyrightCleanup,
      enqueueDataRetentionCleanupContinuation: enqueue,
    }

    await expect(
      processPsql(
        'dataRetentionCleanup',
        first?.data as PsqlRetentionJobData,
        dependencies,
        first!.id,
      ),
    ).rejects.toThrow('enqueue acknowledgement failed')
    const admitted = await psql.getJob(copyrightIds[1]!)
    expect(admitted?.data).toMatchObject({
      continuation: { copyrightFamilies: ['copyrightActionAttempts'] },
    })

    await processPsql(
      'dataRetentionCleanup',
      first?.data as PsqlRetentionJobData,
      dependencies,
      first!.id,
    )
    const second = await psql.getJob(copyrightIds[1]!)
    expect(second?.id).toBe(admitted?.id)
    await processPsql(
      'dataRetentionCleanup',
      second?.data as PsqlRetentionJobData,
      dependencies,
      second!.id,
    )
    expect(await psql.getJob(copyrightIds[2]!)).toBeNull()
    expect(copyrightCleanup).toHaveBeenNthCalledWith(1, {
      activeFamilies: ['copyrightFormScreeningAttempts', 'copyrightActionAttempts'],
      limits: expect.anything(),
    })
    expect(copyrightCleanup).toHaveBeenNthCalledWith(3, {
      activeFamilies: ['copyrightActionAttempts'],
      limits: expect.anything(),
    })
  })
})
