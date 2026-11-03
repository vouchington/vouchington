import { onTestFinished, vi } from 'vitest'
import { verifySignature } from '@modules/http-signatures'
import { createRemoteActorFixture } from './ap-inbox-activity-fixtures.mts'
import * as activityPubDelivery from '../services/activitypub-delivery/index.mts'
import {
  getEntityRelationMetadataOrThrow,
  upsertEntityRelation,
} from '../services/entity-relations/index.mts'
import type { RemoteActorRow } from '../services/remote-actors/index.mts'

export type CapturedActivityPubRequest = {
  url: string
  body: string
  headers: Record<string, string>
}

/**
 * Replaces only the outbound socket under the real `deliverActivityToInbox`: the SSRF lookup
 * resolves to a public address and the POST is recorded instead of sent. Signing, error
 * classification and Retry-After parsing still run in production code. Restored when the test ends.
 */
export function stubActivityPubSocketForTest(
  respond: () => Response = () => new Response(null, { status: 202 }),
): CapturedActivityPubRequest[] {
  const captured: CapturedActivityPubRequest[] = []
  const deliver = activityPubDelivery.deliverActivityToInbox
  const spy = vi.spyOn(activityPubDelivery, 'deliverActivityToInbox').mockImplementation(input =>
    deliver(input, {
      validateUrl: async () => [{ address: '93.184.216.34', family: 4 }],
      fetch: vi.fn<VitestLooseMock>(async (url: string, init: Record<string, unknown>) => {
        captured.push({
          url,
          body: init.body as string,
          headers: init.headers as Record<string, string>,
        })
        return respond()
      }),
    }),
  )
  onTestFinished(() => spy.mockRestore())
  return captured
}

/** Remote actors that follow `sourceUserId`, created through the real inbound relation path. */
export async function createRemoteFollowersForTest(
  sourceUserId: string,
  count: number,
): Promise<RemoteActorRow[]> {
  const followers = await Promise.all(Array.from({ length: count }, createRemoteActorFixture))
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'remote_actor',
    objectType: 'user',
    predicate: 'follow',
  })
  await Promise.all(
    followers.map(follower =>
      upsertEntityRelation(null, relation, { id: follower.id }, [{ id: sourceUserId }], {
        origin: 'remote',
      }),
    ),
  )
  return followers
}

/** Whether a captured request carries a valid HTTP Signature for `publicKeyPem`. */
export function isCapturedActivityPubRequestSigned(
  request: CapturedActivityPubRequest,
  publicKeyPem: string,
): boolean {
  const url = new URL(request.url)
  return verifySignature(
    'POST',
    url.pathname + url.search,
    url.host,
    request.body,
    request.headers.signature!,
    request.headers.digest!,
    request.headers.date!,
    publicKeyPem,
  ).valid
}
