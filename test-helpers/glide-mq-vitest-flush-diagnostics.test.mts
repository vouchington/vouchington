import { describe, expect, it } from 'vitest'
import {
  captureFlushDiagnostics,
  TestQueueFlushTimeoutError,
} from './glide-mq-vitest-flush-diagnostics.mts'

function brokenQueue() {
  return {
    workers: new Set(),
    jobs: new Map(),
    waitingQueue: [],
    isPaused: () => {
      throw new Error('boom')
    },
  } as any
}

describe('captureFlushDiagnostics', () => {
  it('degrades to a partial snapshot when queue introspection throws', () => {
    const diagnostics = captureFlushDiagnostics(brokenQueue(), ['job-1'])

    expect(diagnostics.captureError).toContain('boom')
    expect(diagnostics.workers).toEqual([])
    expect(diagnostics.pendingJobs).toEqual([
      { jobId: 'job-1', state: undefined, inWaitingQueue: false },
    ])
  })

  it('embeds the capture failure in the constructed error message instead of throwing', () => {
    const diagnostics = captureFlushDiagnostics(brokenQueue(), ['job-1'])

    const error = new TestQueueFlushTimeoutError('q', ['job-1'], ['job-1'], 50, diagnostics)
    // The message is this error's literal data-contract output (see captureFlushDiagnostics'
    // degrade-on-throw path), not a fragile human-readable string being pattern-matched incidentally.
    // oxlint-disable-next-line no-mistakes/test-no-error-message-matching -- see comment above
    expect(error.message).toContain('diagnostics capture failed')
    // oxlint-disable-next-line no-mistakes/test-no-error-message-matching -- see comment above
    expect(error.message).toContain('boom')
  })
})
