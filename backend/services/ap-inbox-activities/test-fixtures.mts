/**
 * Test-only fixtures shared across this package's dispatch/record test files: a cached
 * remote_actors row (via the real getOrFetchRemoteActorByKeyId with an injected fetch mock —
 * dependency injection, not a module mock, per backend/CLAUDE.md's non-web mocking policy), a
 * federation-opted-in user, and the deliverActivity queue-polling helpers used to assert an
 * Accept job was enqueued. Kept local to this package rather than @voucha/test-helpers: every
 * backend service devDeps test-helpers for its own tests, so a test-helpers -> @services/remote-actors
 * edge would be a workspace cycle (mirrors ap-post-likes/test-fixtures.mts).
 */

import { vi } from 'vitest'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DeliverActivityData } from '@queues/activitypub-delivery/enqueues'
import { getOrFetchRemoteActorByKeyId, type RemoteActorRow } from '@services/remote-actors'
import { updateUserFields } from '@services/users'
import { createTestUserDirect } from '@voucha/test-helpers'
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

export async function createFederatedUser(): Promise<PrivateUser> {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { fediverse_federation_enabled: true })
  return user
}

// Poll until predicate is satisfied or timeout elapses, then return the final job list.
export async function waitForDeliverActivityJobs(
  predicate: (jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>) => boolean,
  timeoutMs = 1000,
): Promise<Awaited<ReturnType<typeof activitypubDelivery.getJobs>>> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- each bounded poll must observe the latest state before deciding whether to stop
    const jobs = await activitypubDelivery.getJobs('waiting', 0, 100)
    if (predicate(jobs)) return jobs
    // oxlint-disable-next-line no-await-in-loop -- yields between reads within the bounded poll
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  return activitypubDelivery.getJobs('waiting', 0, 100)
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
