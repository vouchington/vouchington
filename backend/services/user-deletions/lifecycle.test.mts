import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createUserDeletionRequest } from './create.mts'
import { addUserDeletionExternalWork, completeUserDeletionExternalWork } from './external-work.mts'
import {
  claimRecoverableUserDeletions,
  claimUserDeletionAttempt,
  processUserDeletionBatch,
} from './lifecycle.mts'
import { USER_DELETION_BATCH_SIZE } from './phases.mts'
import {
  addUserDeletionRelationImpactForTest,
  completeUserDeletionRelationImpactForTest,
  getUserDeletionCompletionAuditForTest,
  getUserDeletionDispatchedAtForTest,
  getUserDeletionRelationImpactIdsForTest,
  getUserDeletionRequestForTest,
  makeUserDeletionRecoverableForTest,
} from './lifecycle.test-support.mts'

describe('user deletion lifecycle', () => {
  it('creates a durable fenced request', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)

    expect(request.userId).toBe(user.id)
    expect(request.requestedById).toBe(user.id)
    expect(request.processingAttemptId).toMatch(/^[0-9a-f-]{36}$/)
    expect(request.currentPhase).toBe('posts')
  })

  it('claims exactly one processing attempt token', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)

    const [first, second] = await Promise.all([
      claimUserDeletionAttempt(request.id, request.processingAttemptId),
      claimUserDeletionAttempt(request.id, request.processingAttemptId),
    ])
    expect([first, second].filter(Boolean)).toHaveLength(1)
  })

  it('runs a fenced attempt at most once under concurrent delivery', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    const processPhaseBatch = vi.fn<() => Promise<{ hasMore: boolean }>>(async () => ({
      hasMore: true,
    }))

    const results = await Promise.all([
      processUserDeletionBatch(request.id, request.processingAttemptId, { processPhaseBatch }),
      processUserDeletionBatch(request.id, request.processingAttemptId, { processPhaseBatch }),
    ])

    expect(processPhaseBatch).toHaveBeenCalledTimes(1)
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('preserves unstarted work tokens and rotates stale work tokens', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    await makeUserDeletionRecoverableForTest(request.id, 'unstarted')
    const unstarted = (await claimRecoverableUserDeletions()).find(
      candidate => candidate.requestId === request.id,
    )
    expect(unstarted?.processingAttemptId).toBe(request.processingAttemptId)
    if (!unstarted) throw new Error('Expected recovered request')

    expect(await claimUserDeletionAttempt(request.id, request.processingAttemptId)).not.toBeNull()
    await makeUserDeletionRecoverableForTest(request.id, 'stale')
    const stale = (await claimRecoverableUserDeletions()).find(
      candidate => candidate.requestId === request.id,
    )
    expect(stale?.processingAttemptId).not.toBe(unstarted.processingAttemptId)
  })

  it('rotates the token after a terminal processing failure before recovery', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)

    await expect(
      processUserDeletionBatch(
        request.id,
        request.processingAttemptId,
        {
          async processPhaseBatch() {
            throw new Error('provider unavailable')
          },
        },
        { isFinalAttempt: true },
      ),
    ).rejects.toThrow('provider unavailable')
    const released = await getUserDeletionRequestForTest(request.id)
    expect(released?.processingAttemptId).not.toBe(request.processingAttemptId)
    if (!released) throw new Error('Expected released request')

    await makeUserDeletionRecoverableForTest(request.id, 'unstarted')
    const recovered = (await claimRecoverableUserDeletions()).find(
      candidate => candidate.requestId === request.id,
    )
    expect(recovered?.processingAttemptId).toBe(released.processingAttemptId)
  })

  it('preserves the token after a non-final processing failure', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)

    await expect(
      processUserDeletionBatch(
        request.id,
        request.processingAttemptId,
        {
          async processPhaseBatch() {
            throw new Error('provider unavailable')
          },
        },
        { isFinalAttempt: false },
      ),
    ).rejects.toThrow('provider unavailable')

    expect((await getUserDeletionRequestForTest(request.id))?.processingAttemptId).toBe(
      request.processingAttemptId,
    )
  })

  it('advances one bounded phase batch and fences stale workers', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)
    let processedBatchSize = 0
    const result = await processUserDeletionBatch(request.id, request.processingAttemptId, {
      async processPhaseBatch(input) {
        processedBatchSize = input.batchSize
        return { hasMore: true }
      },
    })

    expect(processedBatchSize).toBe(USER_DELETION_BATCH_SIZE)
    expect(result).not.toBeNull()
    if (!result) throw new Error('Expected successor')
    expect(
      await processUserDeletionBatch(request.id, request.processingAttemptId, {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      }),
    ).toBeNull()
  })

  it('carries a provider lease delay onto the durable successor', async () => {
    const user = await createTestUser()
    const request = await createUserDeletionRequest(user.id, user.id)

    const before = Date.now()
    const result = await processUserDeletionBatch(request.id, request.processingAttemptId, {
      async processPhaseBatch() {
        return { hasMore: true, retryAfterMs: 60_000 }
      },
    })

    expect(result).toMatchObject({ delayMs: 60_000 })
    expect(
      (await getUserDeletionDispatchedAtForTest(request.id))?.getTime(),
    ).toBeGreaterThanOrEqual(before + 60_000)
  })

  it('retains deletion work until completion and purges sensitive identifiers afterward', async () => {
    const user = await createTestUser({ withEmail: false })
    const request = await createUserDeletionRequest(user.id, user.id, {
      priorUsername: user.username,
    })
    const originalWorkKeys = [`user:${user.id}`, `alternate-user:${user.id}`]
    for (const workKey of originalWorkKeys) {
      await addUserDeletionExternalWork(request.id, 'cloudflare-cache-tag', workKey)
    }
    const recomputedImpactId = await addUserDeletionRelationImpactForTest(request.id, true)
    const incompleteImpactId = await addUserDeletionRelationImpactForTest(request.id, false)
    const relationImpactIds = [recomputedImpactId, incompleteImpactId]
    let currentAttemptId = request.processingAttemptId

    for (let i = 0; i < 6; i++) {
      const result = await processUserDeletionBatch(request.id, currentAttemptId, {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      })
      expect(result).not.toBeNull()
      if (!result) throw new Error('Expected successor')
      currentAttemptId = result.processingAttemptId
    }

    let externalWorkComplete = false
    const processPhaseBatch = async () => ({ hasMore: !externalWorkComplete })
    const blocked = await processUserDeletionBatch(request.id, currentAttemptId, {
      processPhaseBatch,
    })
    expect(blocked).not.toBeNull()
    expect(await getUserDeletionRequestForTest(request.id)).toMatchObject({ completedAt: null })
    if (!blocked) throw new Error('Expected successor')
    for (const workKey of originalWorkKeys) {
      expect(
        await completeUserDeletionExternalWork(request.id, 'cloudflare-cache-tag', workKey),
      ).toBe(true)
    }
    externalWorkComplete = true
    const finalize = await processUserDeletionBatch(request.id, blocked.processingAttemptId, {
      processPhaseBatch,
    })
    expect(finalize).not.toBeNull()
    if (!finalize) throw new Error('Expected successor')
    expect(
      await processUserDeletionBatch(request.id, blocked.processingAttemptId, {
        processPhaseBatch,
      }),
    ).toBeNull()
    const pendingFinalizationAudit = await getUserDeletionCompletionAuditForTest(request.id)
    expect(pendingFinalizationAudit.priorUsername).toBe(user.username)
    expect(pendingFinalizationAudit.externalWorks.map(work => work.workKey)).toEqual(
      expect.arrayContaining(originalWorkKeys),
    )
    const pendingRelationImpactIds = await getUserDeletionRelationImpactIdsForTest(request.id)
    expect(pendingRelationImpactIds).toHaveLength(2)
    expect(pendingRelationImpactIds).toEqual(expect.arrayContaining(relationImpactIds))
    const blockedByIncompleteImpact = await processUserDeletionBatch(
      request.id,
      finalize.processingAttemptId,
      { processPhaseBatch },
    )
    expect(blockedByIncompleteImpact).not.toBeNull()
    if (!blockedByIncompleteImpact) throw new Error('Expected retry')
    expect(await getUserDeletionRequestForTest(request.id)).toMatchObject({ completedAt: null })
    const blockedRelationImpactIds = await getUserDeletionRelationImpactIdsForTest(request.id)
    expect(blockedRelationImpactIds).toHaveLength(2)
    expect(blockedRelationImpactIds).toEqual(expect.arrayContaining(relationImpactIds))
    await completeUserDeletionRelationImpactForTest(incompleteImpactId)
    const redactedAudit = await processUserDeletionBatch(
      request.id,
      blockedByIncompleteImpact.processingAttemptId,
      { processPhaseBatch },
    )
    expect(redactedAudit).not.toBeNull()
    if (!redactedAudit) throw new Error('Expected relation-impact cleanup successor')
    const purgedImpacts = await processUserDeletionBatch(
      request.id,
      redactedAudit.processingAttemptId,
      { processPhaseBatch },
    )
    expect(purgedImpacts).not.toBeNull()
    if (!purgedImpacts) throw new Error('Expected completion successor')
    expect(
      await processUserDeletionBatch(request.id, purgedImpacts.processingAttemptId, {
        processPhaseBatch,
      }),
    ).toBeNull()
    expect(await getUserDeletionRequestForTest(request.id)).toMatchObject({
      completedAt: expect.any(Date),
    })
    const completionAudit = await getUserDeletionCompletionAuditForTest(request.id)
    expect(completionAudit.priorUsername).toBeNull()
    expect(completionAudit.externalWorks).toHaveLength(2)
    expect(
      completionAudit.externalWorks.map(({ workKey: _workKey, ...auditMetadata }) => auditMetadata),
    ).toEqual(
      pendingFinalizationAudit.externalWorks.map(
        ({ workKey: _workKey, ...auditMetadata }) => auditMetadata,
      ),
    )
    const redactedWorkKeys = completionAudit.externalWorks.map(work => work.workKey)
    for (const originalWorkKey of originalWorkKeys) {
      expect(redactedWorkKeys).not.toContain(originalWorkKey)
    }
    expect(new Set(redactedWorkKeys).size).toBe(2)
    for (const work of completionAudit.externalWorks) {
      expect(work.workKind).toBe('cloudflare-cache-tag')
      expect(work.workKey).toBe(`redacted:${work.id}`)
      expect(work.requestedAt).toBeInstanceOf(Date)
      expect(work.completedAt).toBeInstanceOf(Date)
    }
    expect(await getUserDeletionRelationImpactIdsForTest(request.id)).toEqual([])
  })
})
