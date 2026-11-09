import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import { processReconcileAIAgentFailures } from './reconcile-ai-agent-failures.mts'

type FakeJob = {
  id: string
  name: string
  data: Record<string, unknown>
  getState: () => Promise<string>
  remove: () => Promise<void>
}

function fakeJob(
  id: string,
  name: string,
  data: Record<string, unknown>,
  remove: () => Promise<void> = async () => {},
): FakeJob {
  return { id, name, data, getState: async () => 'failed', remove }
}

function stubFailedWindow(failedCount: number, head: FakeJob[], tail: FakeJob[]) {
  vi.spyOn(ai_agents, 'getJobCounts').mockResolvedValue({ failed: failedCount } as never)
  vi.spyOn(ai_agents, 'getJobs').mockImplementation((async (_type: string, start: number) =>
    start === 0 ? head : tail) as never)
}

describe('processReconcileAIAgentFailures bounded windows', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads a second window before the preserved history and reports failed removals', async () => {
    const removeFails = vi.fn<() => Promise<void>>(() =>
      Promise.reject(new Error('remove refused')),
    )
    const head = [
      fakeJob('h0', 'story-post', {}, removeFails),
      fakeJob('h1', 'story-post', {}),
      fakeJob('h2', 'story-post', {}),
    ]
    const tail = [fakeJob('h0', 'story-post', {}), fakeJob('t1', 'story-post', {})]
    stubFailedWindow(10, head, tail)

    const result = await processReconcileAIAgentFailures({ batchSize: 2, historyLimit: 1 })

    expect(removeFails).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ scanned: 4, terminalized: 0, removed: 1, hasMore: true })
  })

  it('keeps manual failure evidence when its terminal marker cannot be written', async () => {
    const removeReport = vi.fn<() => Promise<void>>(async () => {})
    const removeAppeal = vi.fn<() => Promise<void>>(async () => {})
    const head = [
      fakeJob(
        'r0',
        'report-judgement',
        { rerun_by_id: 'staff', run_id: 'not-a-uuid', triggering_report_id: 'not-a-uuid' },
        removeReport,
      ),
      fakeJob(
        'a0',
        'appeal-resolution',
        { rerun_by_id: 'staff', ai_draft_request_token: 'not-a-uuid', appeal_id: 'not-a-uuid' },
        removeAppeal,
      ),
    ]
    stubFailedWindow(2, head, [])

    const result = await processReconcileAIAgentFailures({ batchSize: 2, historyLimit: 1 })

    expect(removeReport).not.toHaveBeenCalled()
    expect(removeAppeal).not.toHaveBeenCalled()
    expect(result).toMatchObject({ terminalized: 0, removed: 0, hasMore: true })
  })
})
