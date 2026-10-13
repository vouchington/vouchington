import { Agent, XRPCError } from '@atproto/api'
import type { OAuthSession } from '@modules/bluesky-oauth'
import { getRetryAfterMs, throwRateLimited, wrapHttpForRetry } from '@modules/queue-errors'

// Thin wrappers around @atproto/api's Agent, the only place in this service that talks to a
// user's PDS. `session` must come from restoreBlueskySession(client, did) (@modules/bluesky-oauth)
// — Agent accepts it directly as a FetchHandlerObject, using its `.did` as the authenticated
// repo for create/delete calls.
//
// Agent.follow() calls app.bsky.graph.follow.create({repo: session.did}, {subject, createdAt}),
// letting the PDS mint the record's `tid` rkey server-side (the lexicon declares `key: "tid"` and
// the reference PDS rejects any other rkey shape — see the 0571 migration's header comment). The
// returned uri is the only way to address this record again, so callers must persist it
// (@services/bluesky-follows/receipts.mts) before this function's result can be considered
// durable.

/* no-mistakes: integration=bluesky */
export async function createFollowOnBluesky(
  session: OAuthSession,
  followeeDid: string,
): Promise<string> {
  const agent = new Agent(session)
  try {
    const { uri } = await agent.follow(followeeDid)
    return uri
  } catch (err) {
    return classifyBlueskyFailure(err)
  }
}

// followUri must be the exact at:// URI returned by createFollowOnBluesky (or previously
// persisted from it) — deleteFollow parses its repo/rkey from the URI itself.
/* no-mistakes: integration=bluesky */
export async function deleteFollowOnBluesky(
  session: OAuthSession,
  followUri: string,
): Promise<void> {
  const agent = new Agent(session)
  try {
    await agent.deleteFollow(followUri)
  } catch (err) {
    classifyBlueskyFailure(err)
  }
}

// A PDS answers a rate limit with HTTP 429 and `ratelimit-reset` (epoch seconds); a proxy may add
// `Retry-After`, which `wrapHttpForRetry` honors. Either way a 429 requeues the job after the named
// wait without consuming an attempt, and any other 4xx except 408 is permanent for this job. A
// network or 5xx failure keeps the queue's bounded attempts.
function classifyBlueskyFailure(error: unknown): never {
  if (
    error instanceof XRPCError &&
    isTooManyRequests(error.status) &&
    getRetryAfterMs(error) === null
  ) {
    const resetMs = getRateLimitResetMs(error.headers)
    if (resetMs !== null) throwRateLimited(resetMs, error)
  }
  return wrapHttpForRetry(error)
}

function isTooManyRequests(status: number): boolean {
  return status === 429
}

// An epoch timestamp, per the PDS rate-limit headers. A small value is the IETF draft's
// delta-seconds form instead. A reset that has already passed names no wait, so it keeps the
// bounded attempt path rather than requeueing at the floor without limit.
const EPOCH_SECONDS_FLOOR = 1_000_000_000

function getRateLimitResetMs(headers: XRPCError['headers']): number | null {
  const reset = Number(headers?.['ratelimit-reset'])
  if (!Number.isFinite(reset) || reset <= 0) return null
  const waitMs = reset >= EPOCH_SECONDS_FLOOR ? reset * 1000 - Date.now() : reset * 1000
  return waitMs > 0 ? waitMs : null
}
