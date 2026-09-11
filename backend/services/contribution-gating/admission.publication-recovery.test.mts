import { describe, expect, it, vi } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  countCapturedQueriesByAnnotation,
  completeContributionAdmissionResponseForTest,
  createTestUserWithAge,
  enableQueryCapture,
  expireContributionAdmissionClaimForTest,
  getContributionAdmissionReservationStateForTest,
  setContributionAdmissionReplayMetadataForTest,
  stopTestQueryCapture,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'
import { executePreparedContribution } from './prepared-contribution.mts'

describe('contribution admission response publication', () => {
  it('publishes a durable completed response instead of stale in-memory create state', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: crypto.randomUUID() }
    const postId = crypto.randomUUID()
    const staleResponse = { post: { id: postId, post_related_topics: [] as string[] } }
    const durableResponse = { post: { id: postId, post_related_topics: ['topic-id'] } }

    const created = await runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: query =>
        executePreparedContribution(query, async () => ({
          response: staleResponse,
          finalize: async () => {
            await completeContributionAdmissionResponseForTest({
              actorId: user.id,
              idempotencyKey,
              response: durableResponse,
            })
          },
        })),
    })

    expect(created).toEqual({ kind: 'created', response: durableResponse })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey,
        intent,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toEqual({ kind: 'replay', response: durableResponse })
  })

  it('does not make a committed mutation retryable when publication fails', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const intent = { request: crypto.randomUUID() }
    const response = { post: { id: crypto.randomUUID() } }
    let executions = 0

    const first = runContributionAdmission({
      actorId: user.id,
      idempotencyKey,
      intent,
      execute: query =>
        executePreparedContribution(query, async () => {
          executions += 1
          return {
            response,
            finalize: async () => {
              await setContributionAdmissionReplayMetadataForTest({
                actorId: user.id,
                idempotencyKey,
                replayMetadata: { padding: 'x'.repeat(8_170) },
              })
            },
          }
        }),
    })

    await expect(first).resolves.toEqual({ kind: 'in_progress', retryAfterSeconds: 1 })
    await expect(
      getContributionAdmissionReservationStateForTest({ actorId: user.id, idempotencyKey }),
    ).resolves.toBe('committed')
    await setContributionAdmissionReplayMetadataForTest({
      actorId: user.id,
      idempotencyKey,
      replayMetadata: { route: 'test', scope: 'test' },
    })
    await expireContributionAdmissionClaimForTest({ actorId: user.id, idempotencyKey })

    const execute = vi.fn<() => Promise<typeof response>>(async () => ({
      post: { id: crypto.randomUUID() },
    }))
    await expect(
      runContributionAdmission({ actorId: user.id, idempotencyKey, intent, execute }),
    ).resolves.toEqual({ kind: 'replay', response })
    expect(execute).not.toHaveBeenCalled()
    expect(executions).toBe(1)
  })

  it('returns the committed response when an unreplayable identity cannot publish', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const idempotencyKey = crypto.randomUUID()
    const response = { post: { id: crypto.randomUUID() } }

    enableQueryCapture()
    let capturedQueries: ReturnType<typeof stopTestQueryCapture> = []
    try {
      await expect(
        runContributionAdmission({
          actorId: user.id,
          idempotencyKey,
          callerCanReplayIdempotencyIdentity: false,
          intent: { request: crypto.randomUUID() },
          execute: query =>
            executePreparedContribution(query, async () => ({
              response,
              finalize: async () => {
                await setContributionAdmissionReplayMetadataForTest({
                  actorId: user.id,
                  idempotencyKey,
                  replayMetadata: { padding: 'x'.repeat(8_170) },
                })
              },
            })),
        }),
      ).resolves.toEqual({ kind: 'created', response })
    } finally {
      capturedQueries = stopTestQueryCapture()
    }
    expect(
      countCapturedQueriesByAnnotation(
        capturedQueries,
        'getCommittedContributionAdmissionResponse',
      ),
    ).toBe(0)
    await expect(
      getContributionAdmissionReservationStateForTest({ actorId: user.id, idempotencyKey }),
    ).resolves.toBe('committed')
  })
})
