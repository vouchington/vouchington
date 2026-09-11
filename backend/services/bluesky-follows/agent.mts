import { Agent } from '@atproto/api'
import type { OAuthSession } from '@modules/bluesky-oauth'

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
  const { uri } = await agent.follow(followeeDid)
  return uri
}

// followUri must be the exact at:// URI returned by createFollowOnBluesky (or previously
// persisted from it) — deleteFollow parses its repo/rkey from the URI itself.
/* no-mistakes: integration=bluesky */
export async function deleteFollowOnBluesky(
  session: OAuthSession,
  followUri: string,
): Promise<void> {
  const agent = new Agent(session)
  await agent.deleteFollow(followUri)
}
