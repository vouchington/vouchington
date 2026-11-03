import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { ValkeyCache } from '@data-stores/valkey/cache'
import Sentry from '@modules/on-error/sentry'
import { failOwnedVoteWeightEnqueue } from '../../test-helpers/vote-weight-dirty-marker.mts'
import { runOAuthAccountConnectionPostCommitEffects } from './connect.mts'

describe('runOAuthAccountConnectionPostCommitEffects', () => {
  it('reports an Error vote-weight failure and continues invalidating email state', async () => {
    const userId = randomUUID()
    const failure = new Error('queue unavailable for Error rejection')
    const enqueue = failOwnedVoteWeightEnqueue(userId, failure)
    const invalidate = vi.spyOn(ValkeyCache.prototype, 'delete')
    const capture = vi.spyOn(Sentry, 'captureException').mockReturnValue('')
    try {
      await runOAuthAccountConnectionPostCommitEffects(userId)
      // The enqueue factory reports the rejection, then the post-commit handler reports it again.
      expect(capture.mock.calls.map(([reported]) => reported)).toEqual([failure, failure])
      expect(invalidate).toHaveBeenCalledWith(userId)
    } finally {
      enqueue.mockRestore()
      invalidate.mockRestore()
      capture.mockRestore()
    }
  })

  it('reports a non-Error vote-weight failure as an Error and continues invalidating email state', async () => {
    const userId = randomUUID()
    const enqueue = failOwnedVoteWeightEnqueue(userId, 'queue unavailable')
    const invalidate = vi.spyOn(ValkeyCache.prototype, 'delete')
    const capture = vi.spyOn(Sentry, 'captureException').mockReturnValue('')
    try {
      await runOAuthAccountConnectionPostCommitEffects(userId)
      const reported = capture.mock.calls.map(([error]) => error as Error)
      expect(reported.map(error => [error instanceof Error, error.message])).toEqual([
        [true, 'queue unavailable'],
        [true, 'queue unavailable'],
      ])
      expect(invalidate).toHaveBeenCalledWith(userId)
    } finally {
      enqueue.mockRestore()
      invalidate.mockRestore()
      capture.mockRestore()
    }
  })
})
