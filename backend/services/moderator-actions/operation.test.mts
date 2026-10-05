import { describe, expect, it, vi } from 'vitest'
import { withRejectedStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { createTestUser } from '@voucha/test-helpers'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { recordStaffOperation } from './operation.mts'
import { searchModeratorActions } from './search.mts'

describe('staff external-operation history', () => {
  it('commits intent before execution and links the successful outcome', async () => {
    const actor = await createTestUser()
    const queueName = `audit-${crypto.randomUUID()}`
    const result = await recordStaffOperation(
      actor.id,
      {
        actionType: 'queue_retry_failed',
        queueName,
      },
      async () => {
        const { results } = await searchModeratorActions({ actorId: actor.id })
        expect(results).toHaveLength(1)
        expect(results[0]).toMatchObject({
          queue_name: queueName,
          metadata: { phase: 'requested' },
        })
        return { attempted: 3, retried: 2 }
      },
      value => ({ after: value }),
    )
    expect(result).toEqual({ attempted: 3, retried: 2 })
    const { results } = await searchModeratorActions({ actorId: actor.id })
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      operation_request_action_id: results[1]!.id,
      metadata: { phase: 'finished', outcome: 'succeeded', after: { attempted: 3, retried: 2 } },
    })
  })

  it('retains failed attempts without storing arbitrary provider errors', async () => {
    const actor = await createTestUser()
    const failure = new Error('private-provider-payload')
    await expect(
      recordStaffOperation(
        actor.id,
        {
          actionType: 'queue_pause',
          queueName: `audit-${crypto.randomUUID()}`,
        },
        () => Promise.reject(failure),
      ),
    ).rejects.toBe(failure)
    const { results } = await searchModeratorActions({ actorId: actor.id })
    expect(results).toHaveLength(2)
    expect(results[0]!.metadata).toEqual({ phase: 'finished', outcome: 'failed' })
    expect(results[0]!.operation_request_action_id).toBe(results[1]!.id)
    expect(JSON.stringify(results)).not.toContain(failure.message)
  })

  it('does not execute when durable intent cannot be recorded', async () => {
    const execute = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    await expect(
      recordStaffOperation(
        crypto.randomUUID(),
        {
          actionType: 'queue_resume',
          queueName: `audit-${crypto.randomUUID()}`,
        },
        execute,
      ),
    ).rejects.toMatchObject({ code: '23503' })
    expect(execute).not.toHaveBeenCalled()
  })
  it('keeps an unresolved request when the outcome cannot be persisted', async () => {
    const actor = await createTestUser()
    const execute = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    await expect(
      withRejectedStaffActionHistory(
        actor.id,
        () =>
          recordStaffOperation(
            actor.id,
            {
              actionType: 'queue_pause',
              queueName: `audit-${crypto.randomUUID()}`,
            },
            execute,
          ),
        'finished',
      ),
    ).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalledTimes(1)
    const { results } = await searchModeratorActions({ actorId: actor.id })
    expect(results).toHaveLength(1)
    expect(results[0]!.metadata).toEqual({ phase: 'requested' })
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Staff operation outcome could not be recorded' }),
      expect.anything(),
    )
  })

  it('preserves the execution failure when its outcome cannot be persisted', async () => {
    const actor = await createTestUser()
    const failure = new Error('original execution failure')
    await expect(
      withRejectedStaffActionHistory(
        actor.id,
        () =>
          recordStaffOperation(actor.id, { actionType: 'queue_pause' }, () =>
            Promise.reject(failure),
          ),
        'finished',
      ),
    ).rejects.toBe(failure)
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    const { results } = await searchModeratorActions({ actorId: actor.id })
    expect(results).toHaveLength(1)
    expect(results[0]!.metadata).toEqual({ phase: 'requested' })
  })

  it('returns the successful result even when outcome summarization or reporting fails', async () => {
    const actor = await createTestUser()
    const result = { accepted: true }
    sentryCaptureExceptionMock.mockImplementationOnce(() => {
      throw new Error('telemetry failure')
    })
    await expect(
      recordStaffOperation(
        actor.id,
        { actionType: 'queue_resume' },
        async () => result,
        () => {
          throw new Error('summary failure')
        },
      ),
    ).resolves.toBe(result)
    const { results } = await searchModeratorActions({ actorId: actor.id })
    expect(results).toHaveLength(1)
    expect(results[0]!.metadata).toEqual({ phase: 'requested' })
  })
})
