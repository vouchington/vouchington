/**
 * Test-only fixtures shared across this package's dispatch/record test files: a cached
 * remote_actors row (via the real getOrFetchRemoteActorByKeyId with an injected fetch mock —
 * dependency injection, not a module mock, per backend/AGENTS.md's non-web mocking policy), a
 * federation-opted-in user, and the deliverActivity queue assertion helper used to select an
 * Accept job. This centralized helper uses source-relative imports for its former
 * owning workspaces to avoid adding higher-layer service dependencies to @voucha/test-helpers.
 */

import { vi } from 'vitest'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { activitypubDelivery } from '../queues/activitypub-delivery/queues.mts'
import type { DeliverActivityData } from '../queues/activitypub-delivery/enqueues.mts'
import type { FetchRemoteActorDocumentDeps } from '../services/remote-actors/fetch-remote-actor-document.mts'
import {
  getOrFetchRemoteActorByKeyId,
  type RemoteActorRow,
} from '../services/remote-actors/index.mts'
import { updateUserFields } from '../services/users/update-fields.mts'
import { createTestUserDirect } from './entities/users-direct.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

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

export async function createFederatedUser(): Promise<PrivateUser> {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { is_fediverse_federation_enabled: true })
  return user
}

export function acceptJobsFor(
  jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
  followActivityId: string,
): Extract<DeliverActivityData, { activityType: 'Accept' }>[] {
  const acceptJobs: Extract<DeliverActivityData, { activityType: 'Accept' }>[] = []
  for (const job of jobs) {
    if (job.name !== 'deliverActivity') continue
    const data = job.data as DeliverActivityData
    if (data.activityType === 'Accept' && data.followActivityId === followActivityId) {
      acceptJobs.push(data)
    }
  }
  return acceptJobs
}
