import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { enqueueDataRetentionCleanupContinuation } from '@queues/psql/enqueues'
import { psql } from '@queues/psql/queues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import {
  createCopyrightRetentionContinuationFixture,
  createCopyrightInactiveRetentionFixture,
} from '@voucha/test-helpers/copyright-retention-continuation'
import {
  readCopyrightExecutionResult,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import { loseNextPsqlJobAddReplyForTest } from '@voucha/test-helpers/injected-failures'
import processPsql from '../processors.mts'

describe('copyright retention continuation', () => {
  it('reuses an admitted child after enqueue failure and drains only pending families', async () => {
    const fixture = await createCopyrightRetentionContinuationFixture()
    expect(fixture.firstId.localeCompare(fixture.outsideId)).toBeLessThan(0)
    expect(fixture.outsideId.localeCompare(fixture.secondId)).toBeLessThan(0)
    const outsideBefore = await fixture.readOutsideState()
    expect(outsideBefore).toMatchObject([
      {
        action_attempt: { id: fixture.outsideId },
        action_result: { attempt_id: fixture.outsideId },
        form_attempt: { id: fixture.formOutsideId, state: 'failed' },
      },
    ])
    const options = {
      copyright: {
        scopes: fixture.scopes,
        now: fixture.now,
        limits: { batchSize: 1, maxBatches: 1 },
      },
    }
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
      activePostModerationKinds: [],
      copyrightFamilies: ['copyrightFormScreeningAttempts', 'copyrightActionAttempts'],
    })
    const first = await psql.getJob(copyrightIds[0]!)
    expect(initial[0]?.id).toBe(first?.id)
    expect(first?.opts).toMatchObject({ ordering: { key: 'data_retention:cleanup' } })
    onTestFinished(
      loseNextPsqlJobAddReplyForTest(copyrightIds[1]!, new Error('enqueue acknowledgement failed')),
    )

    await expect(
      processPsql(
        'dataRetentionCleanup',
        first?.data as PsqlRetentionJobData,
        undefined,
        first!.id,
        options,
      ),
    ).rejects.toThrow('enqueue acknowledgement failed')
    expect(await readCopyrightOperationalRow('action_attempts', fixture.firstId)).toBe(false)
    expect(await readCopyrightExecutionResult('action', fixture.firstId)).toBe(false)
    expect(await readCopyrightOperationalRow('action_attempts', fixture.secondId)).toBe(true)
    const admitted = await psql.getJob(copyrightIds[1]!)
    expect(admitted?.data).toMatchObject({
      continuation: { copyrightFamilies: ['copyrightActionAttempts'] },
    })

    expect(
      await processPsql(
        'dataRetentionCleanup',
        first?.data as PsqlRetentionJobData,
        undefined,
        first!.id,
        options,
      ),
    ).toEqual({
      copyrightFormScreeningAttempts: { scanned: 0, deleted: 0, hasMore: false },
      copyrightActionAttempts: { scanned: 1, deleted: 1, hasMore: true },
    })
    const second = await psql.getJob(copyrightIds[1]!)
    expect(second?.id).toBe(admitted?.id)
    expect(
      await processPsql(
        'dataRetentionCleanup',
        second?.data as PsqlRetentionJobData,
        undefined,
        second!.id,
        options,
      ),
    ).toEqual({ copyrightActionAttempts: { scanned: 0, deleted: 0, hasMore: false } })
    expect(await psql.getJob(copyrightIds[2]!)).toBeNull()
    expect(await readCopyrightOperationalRow('action_attempts', fixture.secondId)).toBe(false)
    expect(await readCopyrightExecutionResult('action', fixture.secondId)).toBe(false)
    expect(await readCopyrightOperationalRow('action_attempts', fixture.latestId)).toBe(true)
    expect(await fixture.readOutsideState()).toEqual(outsideBefore)
  })
  it('returns no families with default options when the continuation selects none', async () => {
    const outside = await createCopyrightInactiveRetentionFixture()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(outside.now)
      expect(await readCopyrightOperationalRow('action_attempts', outside.outsideId)).toBe(true)
      expect(await readCopyrightExecutionResult('action', outside.outsideId)).toBe(true)

      await expect(
        processPsql('dataRetentionCleanup', {
          continuation: {
            runId: randomUUID(),
            step: 1,
            activeClassifierSweeps: [],
            activeMembershipFamilies: [],
            activePostModerationKinds: [],
            copyrightFamilies: [],
          },
        }),
      ).resolves.toEqual({})
      expect(await readCopyrightOperationalRow('action_attempts', outside.outsideId)).toBe(true)
      expect(await readCopyrightExecutionResult('action', outside.outsideId)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
