import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestExpiryWindow,
  createTestUser,
  deleteTopicImportAttemptForTest,
  expireTopicImportAttemptForTest,
  getTopicImportAttemptRetentionExpiryForTest,
  topicImportAttemptExistsForTest,
} from '@voucha/test-helpers'
import {
  claimTopicImportAttempt,
  finalizeTopicImportAttempt,
  pruneExpiredTopicImportAttempts,
} from './topic-import-attempts.mts'
import type { ImportTopicResult } from './import-topics.mts'

describe('topic import attempts', () => {
  it('prunes only expired attempts inside the requested retention window', async () => {
    const user = await createTestUser()
    const idempotencyKey = crypto.randomUUID()
    const window = createTestExpiryWindow()
    onTestFinished(() => deleteTopicImportAttemptForTest(user.id, idempotencyKey))
    await claimTopicImportAttempt(user.id, idempotencyKey, [`retention-${crypto.randomUUID()}`])
    await expireTopicImportAttemptForTest(user.id, idempotencyKey, window.firstEligibleDate)

    await expect(
      pruneExpiredTopicImportAttempts(
        new Date(window.firstEligibleDate.getTime() - 1),
        1,
        window.lowerBoundDate,
      ),
    ).resolves.toBe(0)
    await expect(
      pruneExpiredTopicImportAttempts(window.now, 1, window.lowerBoundDate),
    ).resolves.toBe(1)
    await expect(topicImportAttemptExistsForTest(user.id, idempotencyKey)).resolves.toBe(false)
  })

  it('serializes concurrent finalizers on the attempt row', async () => {
    const user = await createTestUser()
    const attempt = await claimTopicImportAttempt(user.id, crypto.randomUUID(), ['concurrent'])
    const winner: ImportTopicResult[] = [{ input: 'concurrent', status: 'followed' }]
    const loser: ImportTopicResult[] = [{ input: 'concurrent', status: 'already_following' }]
    let releaseWinner!: () => void
    let winnerLocked!: () => void
    let loserSubmitted!: () => void
    const release = new Promise<void>(resolve => {
      releaseWinner = resolve
    })
    const locked = new Promise<void>(resolve => {
      winnerLocked = resolve
    })
    const submitted = new Promise<void>(resolve => {
      loserSubmitted = resolve
    })
    let loserBuilt = false

    const first = finalizeTopicImportAttempt(attempt.id, async () => {
      winnerLocked()
      await release
      return winner
    })
    await locked
    const second = (() => {
      const completion = finalizeTopicImportAttempt(attempt.id, async () => {
        loserBuilt = true
        return loser
      })
      loserSubmitted()
      return completion
    })()
    await submitted
    releaseWinner()

    await expect(first).resolves.toEqual(winner)
    await expect(second).resolves.toEqual(winner)
    expect(loserBuilt).toBe(false)
  })

  it('extends a completed replay attempt when returning its stored response', async () => {
    const user = await createTestUser()
    const idempotencyKey = crypto.randomUUID()
    const attempt = await claimTopicImportAttempt(user.id, idempotencyKey, ['replay'])
    const response: ImportTopicResult[] = [{ input: 'replay', status: 'followed' }]
    const previousExpiry = new Date(Date.now() + 60_000)
    onTestFinished(() => deleteTopicImportAttemptForTest(user.id, idempotencyKey))
    await finalizeTopicImportAttempt(attempt.id, async () => response)
    await expireTopicImportAttemptForTest(user.id, idempotencyKey, previousExpiry)

    await expect(claimTopicImportAttempt(user.id, idempotencyKey, ['replay'])).resolves.toEqual({
      id: attempt.id,
      response,
    })
    const refreshedExpiry = await getTopicImportAttemptRetentionExpiryForTest(
      user.id,
      idempotencyKey,
    )
    expect(refreshedExpiry!.getTime()).toBeGreaterThan(previousExpiry.getTime())
  })

  it('rejects non-positive prune batch sizes', async () => {
    await expect(pruneExpiredTopicImportAttempts(new Date(), 0)).rejects.toThrow(
      'batchSize must be positive',
    )
  })
})
