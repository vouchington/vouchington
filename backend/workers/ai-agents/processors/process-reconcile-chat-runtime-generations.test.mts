import { describe, expect, it, vi } from 'vitest'
import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'
import {
  processReconcileChatRuntimeGenerations,
  type ReconcileChatRuntimeGenerationDeps,
} from './process-reconcile-chat-runtime-generations.mts'

describe('processReconcileChatRuntimeGenerations', () => {
  it('signals selected chat jobs before terminalizing their durable runs', async () => {
    const order: string[] = []
    const signalJob = vi.fn<ReconcileChatRuntimeGenerationDeps['signalJob']>(
      async (jobId, signalName) => {
        order.push(`signal:${jobId}:${signalName}`)
      },
    )
    const reconcileStaleChatRuntimeGenerations = vi.fn<
      ReconcileChatRuntimeGenerationDeps['reconcileStaleChatRuntimeGenerations']
    >(async () => {
      order.push('reconcile')
      return { chats: 1 }
    })

    await processReconcileChatRuntimeGenerations({
      getStaleChatRuntimeGenerationJobs: async () => ({
        cutoff: new Date('2026-07-01T00:00:00Z'),
        candidates: [
          {
            id: 'run-one',
            signalJobId: 'chat_assistant-one',
            startedAt: new Date('2026-06-30T23:00:00Z'),
          },
        ],
      }),
      signalJob,
      reconcileStaleChatRuntimeGenerations,
    })

    expect(order).toEqual([`signal:chat_assistant-one:${CHAT_SSE_CYCLE_EXPIRED}`, 'reconcile'])
  })

  it('still reconciles a stale run when its worker signal fails', async () => {
    const reconcileStaleChatRuntimeGenerations = vi.fn<
      ReconcileChatRuntimeGenerationDeps['reconcileStaleChatRuntimeGenerations']
    >(async () => ({ chats: 0 }))

    await processReconcileChatRuntimeGenerations({
      getStaleChatRuntimeGenerationJobs: async () => ({
        cutoff: new Date('2026-07-01T00:00:00Z'),
        candidates: [
          {
            id: 'run-one',
            signalJobId: 'chat_assistant-one',
            startedAt: new Date('2026-06-30T23:00:00Z'),
          },
        ],
      }),
      signalJob: () => Promise.reject(new Error('worker unavailable')),
      reconcileStaleChatRuntimeGenerations,
    })

    expect(reconcileStaleChatRuntimeGenerations).toHaveBeenCalledOnce()
  })
})
