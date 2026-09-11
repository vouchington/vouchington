/**
 * Test-only fixture: a cached remote_actors row, created via the real
 * getOrFetchRemoteActorByKeyId with an injected fetch mock (dependency injection, not a module
 * mock — see backend/CLAUDE.md's non-web mocking policy). Duplicated from
 * @services/ap-inbox-activities's dispatch-activity.test.mts rather than shared through
 * @voucha/test-helpers: every backend service devDeps test-helpers for its own tests, so a
 * test-helpers -> @services/remote-actors edge would be a workspace cycle.
 */

import { vi } from 'vitest'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { getOrFetchRemoteActorByKeyId, type RemoteActorRow } from '@services/remote-actors'

const VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM = generateRsaSha256KeyPair().publicKeyPem

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

function makeJsonResponse(body: unknown, status = 200): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(stream, { status })
}

export async function createRemoteActorFixture(): Promise<RemoteActorRow> {
  const actorUri = `https://remote.example/users/${randomSuffix()}`
  const keyId = `${actorUri}#main-key`
  const fetchWithTimeout = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
    response: makeJsonResponse({
      id: actorUri,
      inbox: `${actorUri}/inbox`,
      publicKey: {
        id: keyId,
        publicKeyPem: VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
      },
    }),
    responseSignal: new AbortController().signal,
  })
  const validateUrl = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  return getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })
}
