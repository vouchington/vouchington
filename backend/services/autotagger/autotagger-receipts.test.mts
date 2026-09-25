import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestTopic,
} from '../../test-helpers/entities/create-test-entities.mts'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
} from '../../test-helpers/entities/test-entities.mts'
import { createTestUser } from '../../test-helpers/entities/users.mts'
import {
  expireAutotaggerReceiptLease,
  listAutotaggerReceiptAttempts,
} from '../../test-helpers/data-stores/psql/autotagger-receipts.mts'
import {
  claimAutotaggerReceipt,
  type AutotaggerReceiptSubject,
} from './claim-autotagger-receipt.mts'
import { completeAutotaggerReceipt, failAutotaggerReceipt } from './complete-autotagger-receipt.mts'
import { computeAutotaggerReceiptDigest } from './receipt-digest.mts'

function digestFor(seed: string): Buffer {
  return computeAutotaggerReceiptDigest({
    state: seed,
    questions: [
      {
        questionId: randomUUID(),
        question: 'Is this post about topic X?',
        candidateId: randomUUID(),
      },
    ],
    scopeCategory: 'global',
    scopeCommunityId: null,
    effectiveCap: 5,
    classifierId: randomUUID(),
    promptVersionId: randomUUID(),
    modelProvider: 'typesafe',
    modelName: 'typesafe/jev-1.13',
  })
}

async function postSubject(): Promise<AutotaggerReceiptSubject> {
  const post = await createTestPost()
  return { postId: post.id, rssFeedItemId: null }
}

describe('autotagger receipts', () => {
  it('claims a brand-new receipt identity', async () => {
    const subject = await postSubject()
    const digest = digestFor(randomUUID())

    const result = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })

    expect(result.kind).toBe('claimed')
    if (result.kind !== 'claimed') throw new Error('expected claimed')
    expect(result.attemptNumber).toBe(1)
    expect(result.leaseToken).toBeTruthy()
    expect(result.batchId).toBeTruthy()
    expect(result.receiptId).toBeTruthy()
  })

  it('reports in_progress for a duplicate claim while the lease is live', async () => {
    const subject = await postSubject()
    const digest = digestFor(randomUUID())

    const first = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })
    if (first.kind !== 'claimed') throw new Error('expected claimed')

    const second = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })

    expect(second.kind).toBe('in_progress')
    if (second.kind !== 'in_progress') throw new Error('expected in_progress')
    expect(second.retryAfterSeconds).toBeGreaterThan(0)

    const attempts = await listAutotaggerReceiptAttempts(first.receiptId)
    expect(attempts).toHaveLength(1)
  })

  it('reports completed with the original batchId for a claim replayed after completion', async () => {
    const subject = await postSubject()
    const digest = digestFor(randomUUID())

    const first = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })
    if (first.kind !== 'claimed') throw new Error('expected claimed')

    expect(await completeAutotaggerReceipt(first.receiptId, first.leaseToken)).toBe(true)

    const replay = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })

    expect(replay).toEqual({
      kind: 'completed',
      receiptId: first.receiptId,
      batchId: first.batchId,
    })
  })

  it('reclaims an expired lease, closing the stale attempt as expired and starting a new one', async () => {
    const subject = await postSubject()
    const digest = digestFor(randomUUID())

    const first = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })
    if (first.kind !== 'claimed') throw new Error('expected claimed')

    await expireAutotaggerReceiptLease(first.receiptId)

    const reclaimed = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })

    expect(reclaimed.kind).toBe('claimed')
    if (reclaimed.kind !== 'claimed') throw new Error('expected claimed')
    expect(reclaimed.receiptId).toBe(first.receiptId)
    expect(reclaimed.batchId).toBe(first.batchId)
    expect(reclaimed.attemptNumber).toBe(2)
    expect(reclaimed.leaseToken).not.toBe(first.leaseToken)

    const attempts = await listAutotaggerReceiptAttempts(first.receiptId)
    expect(attempts).toHaveLength(2)
    expect(attempts[0]).toMatchObject({
      attempt_number: 1,
      lease_token: first.leaseToken,
      outcome: 'expired',
      completed_at: null,
    })
    expect(attempts[0]!.failed_at).not.toBeNull()
    expect(attempts[1]).toMatchObject({
      attempt_number: 2,
      lease_token: reclaimed.leaseToken,
      outcome: null,
      completed_at: null,
      failed_at: null,
    })

    // The reclaimed lease is now the live one: the original owner can no longer complete it.
    expect(await completeAutotaggerReceipt(first.receiptId, first.leaseToken)).toBe(false)
    expect(await completeAutotaggerReceipt(reclaimed.receiptId, reclaimed.leaseToken)).toBe(true)
  })

  it('fences completion so a stale lease token cannot complete over the current claimant', async () => {
    const subject = await postSubject()
    const digest = digestFor(randomUUID())

    const claimed = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })
    if (claimed.kind !== 'claimed') throw new Error('expected claimed')

    expect(await completeAutotaggerReceipt(claimed.receiptId, randomUUID())).toBe(false)
    expect(await completeAutotaggerReceipt(claimed.receiptId, claimed.leaseToken)).toBe(true)
    // A second completion with the now-cleared token is also rejected (no lease to fence against).
    expect(await completeAutotaggerReceipt(claimed.receiptId, claimed.leaseToken)).toBe(false)
  })

  it.each(['provider-error', 'invalid-result'] as const)(
    'fails a receipt with outcome %s, fencing on the lease token and releasing it',
    async outcome => {
      const subject = await postSubject()
      const digest = digestFor(randomUUID())

      const claimed = await claimAutotaggerReceipt({
        subject,
        digestVersion: 1,
        digest,
        leaseSeconds: 60,
      })
      if (claimed.kind !== 'claimed') throw new Error('expected claimed')

      expect(await failAutotaggerReceipt(claimed.receiptId, randomUUID(), outcome)).toBe(false)
      expect(await failAutotaggerReceipt(claimed.receiptId, claimed.leaseToken, outcome)).toBe(true)

      const attempts = await listAutotaggerReceiptAttempts(claimed.receiptId)
      expect(attempts).toHaveLength(1)
      expect(attempts[0]).toMatchObject({ attempt_number: 1, outcome, completed_at: null })
      expect(attempts[0]!.failed_at).not.toBeNull()

      const retried = await claimAutotaggerReceipt({
        subject,
        digestVersion: 1,
        digest,
        leaseSeconds: 60,
      })
      expect(retried.kind).toBe('claimed')
      if (retried.kind !== 'claimed') throw new Error('expected claimed')
      expect(retried.attemptNumber).toBe(2)
    },
  )

  it('creates a brand-new receipt identity when the digest changes for the same subject', async () => {
    const subject = await postSubject()

    const first = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest: digestFor('digest-a'),
      leaseSeconds: 60,
    })
    const second = await claimAutotaggerReceipt({
      subject,
      digestVersion: 1,
      digest: digestFor('digest-b'),
      leaseSeconds: 60,
    })
    if (first.kind !== 'claimed' || second.kind !== 'claimed') throw new Error('expected claimed')

    expect(second.receiptId).not.toBe(first.receiptId)
    expect(second.batchId).not.toBe(first.batchId)
  })

  it('claims a receipt identity for an rss feed item subject', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const digest = digestFor(randomUUID())

    const result = await claimAutotaggerReceipt({
      subject: { postId: null, rssFeedItemId: item.id },
      digestVersion: 1,
      digest,
      leaseSeconds: 60,
    })

    expect(result.kind).toBe('claimed')
    if (result.kind !== 'claimed') throw new Error('expected claimed')
    expect(result.attemptNumber).toBe(1)
  })
})
