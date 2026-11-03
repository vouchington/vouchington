import dns from 'node:dns'
import net from 'node:net'
import { onTestFinished, vi } from 'vitest'
import undici from 'undici'
import { verifySignature } from '@modules/http-signatures'
import { createRemoteActorFixture } from './ap-inbox-activity-fixtures.mts'
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
 * Replaces only the network under the real `deliverActivityToInbox`: DNS answers a public address
 * for non-IP hostnames and the POST is recorded instead of sent. The SSRF guard, signing, error
 * classification and Retry-After parsing still run in production code. Restored when the test ends.
 */
export function stubActivityPubSocketForTest(
  respond: () => Response = () => new Response(null, { status: 202 }),
): CapturedActivityPubRequest[] {
  const captured: CapturedActivityPubRequest[] = []
  stubPublicDnsForTest()
  const originalFetch = undici.fetch
  const fetchSpy = vi.spyOn(undici, 'fetch').mockImplementation((async (
    url: string,
    init?: Record<string, unknown>,
  ) => {
    if (init?.method !== 'POST') return originalFetch(url, init as never)
    captured.push({
      url,
      body: init.body as string,
      headers: init.headers as Record<string, string>,
    })
    return respond()
  }) as never)
  onTestFinished(() => fetchSpy.mockRestore())
  return captured
}

/** Resolves every non-IP hostname to a public address; real IP literals skip DNS in the guard. */
export function stubPublicDnsForTest(): void {
  const lookup = dns.promises.lookup as (hostname: string, options?: unknown) => Promise<unknown>
  const spy = vi.spyOn(dns.promises, 'lookup').mockImplementation((async (
    hostname: string,
    options?: unknown,
  ) => {
    if (net.isIP(hostname)) return lookup.call(dns.promises, hostname, options)
    return [{ address: '93.184.216.34', family: 4 }]
  }) as never)
  onTestFinished(() => spy.mockRestore())
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
