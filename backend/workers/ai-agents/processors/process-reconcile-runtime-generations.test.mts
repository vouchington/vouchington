import { describe, expect, it, vi } from 'vitest'
import {
  processReconcileRuntimeGenerations,
  type ReconcileRuntimeGenerationDeps,
} from './process-reconcile-runtime-generations.mts'
import { RUNTIME_GENERATION_INTERRUPTED_SIGNAL } from '@services/agent-responses/reconcile-runtime-generations'

describe('processReconcileRuntimeGenerations', () => {
  it('signals stable jobs before terminalizing stale generations', async () => {
    const order: string[] = []
    const signalJob = vi.fn<ReconcileRuntimeGenerationDeps['signalJob']>(
      async (jobId, signalName) => {
        order.push(`signal:${jobId}:${signalName}`)
      },
    )
    const reconcileStaleRuntimeGenerations = vi.fn<
      ReconcileRuntimeGenerationDeps['reconcileStaleRuntimeGenerations']
    >(async () => {
      order.push('reconcile')
      return { agentResponses: 1, chats: 1, agentResponseIds: ['response-one'] }
    })
    const publishAgentResponseEvent = vi.fn<
      ReconcileRuntimeGenerationDeps['publishAgentResponseEvent']
    >(async id => {
      order.push(`publish:${id}`)
    })

    await processReconcileRuntimeGenerations({
      getStaleRuntimeGenerationJobs: vi.fn<
        ReconcileRuntimeGenerationDeps['getStaleRuntimeGenerationJobs']
      >(async () => ({
        cutoff: new Date('2026-07-01T00:00:00Z'),
        candidates: [
          {
            kind: 'agent-response',
            id: 'response-one',
            signalJobId: 'agent-response_one',
            startedAt: new Date('2026-06-30T23:00:00Z'),
          },
          {
            kind: 'chat',
            id: 'run-two',
            signalJobId: 'chat_assistant-two',
            startedAt: new Date('2026-06-30T23:01:00Z'),
          },
        ],
      })),
      signalJob,
      reconcileStaleRuntimeGenerations,
      publishAgentResponseEvent,
    })

    expect(order).toEqual([
      `signal:agent-response_one:${RUNTIME_GENERATION_INTERRUPTED_SIGNAL}`,
      'signal:chat_assistant-two:sse-cycle-expired',
      'reconcile',
      'publish:response-one',
    ])
    expect(publishAgentResponseEvent).toHaveBeenCalledWith('response-one', {
      type: 'error',
      error: 'The response was interrupted. Please try again.',
    })
  })

  it('continues reconciliation when a job signal fails', async () => {
    const failure = Object.assign(new Error('job unavailable'), {
      tags: { suppressLogging: true },
    })
    const reconcile = vi.fn<ReconcileRuntimeGenerationDeps['reconcileStaleRuntimeGenerations']>(
      async () => ({ agentResponses: 0, chats: 0, agentResponseIds: [] }),
    )

    await processReconcileRuntimeGenerations({
      getStaleRuntimeGenerationJobs: vi.fn<
        ReconcileRuntimeGenerationDeps['getStaleRuntimeGenerationJobs']
      >(async () => ({
        cutoff: new Date('2026-07-01T00:00:00Z'),
        candidates: [
          {
            kind: 'agent-response',
            id: 'response-failed-signal',
            signalJobId: 'agent-response_failed-signal',
            startedAt: new Date('2026-06-30T23:00:00Z'),
          },
        ],
      })),
      signalJob: vi.fn<ReconcileRuntimeGenerationDeps['signalJob']>(() => Promise.reject(failure)),
      reconcileStaleRuntimeGenerations: reconcile,
      publishAgentResponseEvent: vi.fn<ReconcileRuntimeGenerationDeps['publishAgentResponseEvent']>(
        async () => undefined,
      ),
    })

    expect(reconcile).toHaveBeenCalledOnce()
  })

  it('uses the default queue signal boundary when it is not overridden', async () => {
    await expect(
      processReconcileRuntimeGenerations({
        getStaleRuntimeGenerationJobs: vi.fn<
          ReconcileRuntimeGenerationDeps['getStaleRuntimeGenerationJobs']
        >(async () => ({
          cutoff: new Date('2026-07-01T00:00:00Z'),
          candidates: [
            {
              kind: 'agent-response',
              id: 'response-default-signal',
              signalJobId: 'agent-response_missing-job',
              startedAt: new Date('2026-06-30T23:00:00Z'),
            },
          ],
        })),
        reconcileStaleRuntimeGenerations: vi.fn<
          ReconcileRuntimeGenerationDeps['reconcileStaleRuntimeGenerations']
        >(async () => ({ agentResponses: 0, chats: 0, agentResponseIds: [] })),
      }),
    ).resolves.toBeUndefined()
  })
})
