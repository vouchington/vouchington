import { XRPCError } from '@atproto/api'
import { UnrecoverableError } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import type { OAuthSession } from '@modules/bluesky-oauth'
import { createFollowOnBluesky, deleteFollowOnBluesky } from './agent.mts'

const FOLLOWER_DID = 'did:plc:agentfollower'
const FOLLOWEE_DID = 'did:plc:agentfollowee'
const FOLLOW_URI = `at://${FOLLOWER_DID}/app.bsky.graph.follow/3kagenttest`

// The PDS answers at the HTTP boundary; the real atproto client turns it into an XRPCError.
function sessionAnswering(status: number, headers: Record<string, string> = {}): OAuthSession {
  return {
    did: FOLLOWER_DID,
    fetchHandler: async () =>
      new Response(JSON.stringify({ error: 'PdsError', message: `status ${status}` }), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
  } as unknown as OAuthSession
}

async function failureOf(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error('Expected the Bluesky call to fail')
    },
    (err: unknown) => err,
  )
}

describe('Bluesky follow calls under PDS failures', () => {
  it.each([
    ['create', (session: OAuthSession) => createFollowOnBluesky(session, FOLLOWEE_DID)],
    ['delete', (session: OAuthSession) => deleteFollowOnBluesky(session, FOLLOW_URI)],
  ])('%s: requeues a 429 until the PDS rate-limit window resets', async (_name, call) => {
    const resetsAt = Math.floor(Date.now() / 1000) + 600

    const failure = await failureOf(
      call(sessionAnswering(429, { 'ratelimit-reset': String(resetsAt) })),
    )

    expect(failure).toMatchObject({ name: 'RateLimitError', cause: expect.any(XRPCError) })
    const { delayMs } = failure as { delayMs: number }
    expect(delayMs).toBeGreaterThan(590_000)
    expect(delayMs).toBeLessThanOrEqual(600_000)
  })

  it('prefers a Retry-After when the PDS or a proxy sends one', async () => {
    const failure = await failureOf(
      createFollowOnBluesky(
        sessionAnswering(429, { 'retry-after': '30', 'ratelimit-reset': '1' }),
        FOLLOWEE_DID,
      ),
    )

    expect(failure).toMatchObject({ name: 'RateLimitError', delayMs: 30_000 })
  })

  it('reads a small ratelimit-reset as delta-seconds', async () => {
    const failure = await failureOf(
      createFollowOnBluesky(sessionAnswering(429, { 'ratelimit-reset': '45' }), FOLLOWEE_DID),
    )

    expect(failure).toMatchObject({ name: 'RateLimitError', delayMs: 45_000 })
  })

  it.each([
    ['a reset that already passed', { 'ratelimit-reset': '1700000000' }],
    ['a malformed reset', { 'ratelimit-reset': 'soon' }],
    ['no hint', {}],
  ])('leaves a 429 with %s to the queue attempts', async (_name, headers) => {
    const failure = await failureOf(
      createFollowOnBluesky(sessionAnswering(429, headers), FOLLOWEE_DID),
    )

    expect(failure).toBeInstanceOf(XRPCError)
    expect(failure).toMatchObject({ status: 429 })
  })

  it.each([400, 401, 403, 404])('ends the job for a permanent %s', async status => {
    const failure = await failureOf(createFollowOnBluesky(sessionAnswering(status), FOLLOWEE_DID))

    expect(failure).toBeInstanceOf(UnrecoverableError)
  })

  it.each([500, 502, 503])('leaves a %s outage to the queue attempts', async status => {
    const failure = await failureOf(deleteFollowOnBluesky(sessionAnswering(status), FOLLOW_URI))

    expect(failure).toBeInstanceOf(XRPCError)
    expect(failure).toMatchObject({ status: expect.any(Number) })
  })
})
