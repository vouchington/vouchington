/**
 * Test-only fixture: a cached remote_actors row, created via the real
 * getOrFetchRemoteActorByKeyId with an injected fetch mock (dependency injection, not a module
 * mock — see backend/AGENTS.md's non-web mocking policy). This centralized helper uses a
 * source-relative service import to avoid a higher-layer workspace dependency cycle.
 */

import { vi } from 'vitest'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import type { FetchRemoteActorDocumentDeps } from '../services/remote-actors/fetch-remote-actor-document.mts'
import {
  getOrFetchRemoteActorByKeyId,
  type RemoteActorRow,
} from '../services/remote-actors/index.mts'

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
  const fetchWithTimeout = vi
    .fn<FetchRemoteActorDocumentDeps['fetchWithTimeout']>()
    .mockResolvedValueOnce({
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
    .fn<FetchRemoteActorDocumentDeps['validateUrl']>()
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  return getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })
}
