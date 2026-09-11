import { describe, it, expect } from 'vitest'
import {
  createTestUserDirect,
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
  insertTestTopic,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow, upsertEntityRelation } from '@services/entity-relations'
import { listRemoteFollowerInboxPage } from './list-followers-of-user.mts'
import { getOrFetchRemoteActorByKeyId } from './get-or-fetch.mts'
import { makeJsonResponse, VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM } from './test-fixtures.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

const FOLLOW_RELATION = {
  subjectType: 'remote_actor',
  objectType: 'user',
  predicate: 'follow',
} as const

// Creates a fediverse_instance directory topic for `hostname` (mirrors approveFediverseInstance
// in backend/api/activitypub/inbox.test.mts) and returns its topic id so a test can later append
// further integration-status changes (e.g. block, then unblock) against the same topic.
async function createFediverseInstanceTopic(
  hostname: string,
  integrationStatus?: 'pending' | 'approved' | 'blocked',
): Promise<string> {
  const user = await createTestUserDirect()
  const hostnameId = await insertTestUrlHostname({ hostname })
  const suffix = randomSuffix()
  const topicId = await insertTestTopic({
    name: `Follower Test Instance ${suffix}`,
    slug: `follower-test-instance-${suffix}`,
    createdById: user.id,
    topicType: 'fediverse_instance',
    hostnameId,
  })
  await insertTestFediverseInstanceExtension({ topicId, software: 'mastodon' })
  if (integrationStatus) {
    await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus })
  }
  return topicId
}

// Persists a real remote_actors row (via injected fetch deps, no real network call) whose
// actor_uri resolves to `hostname`, then follows `targetUserId` through the same
// upsertEntityRelation write-path the inbox receiver uses. Mirrors createRemoteActorFixture in
// backend/api/activitypub/inbox.test.mts.
async function createFollowingRemoteActor(hostname: string, targetUserId: string) {
  const suffix = randomSuffix()
  const actorUri = `https://${hostname}/users/actor-${suffix}`
  const keyId = `${actorUri}#main-key`
  const fetchWithTimeout = async () => ({
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
  const validateUrl = async () => [{ address: '93.184.216.34', family: 4 as const }]

  const remoteActor = await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })
  await upsertEntityRelation(
    null,
    getEntityRelationMetadataOrThrow(FOLLOW_RELATION),
    { id: remoteActor.id },
    [{ id: targetUserId }],
    { origin: 'remote' },
  )
  return remoteActor
}

async function collectInboxUrls(userId: string): Promise<string[]> {
  return (await listRemoteFollowerInboxPage(userId, null, 501)).flatMap(row =>
    row.inboxUrl ? [row.inboxUrl] : [],
  )
}

describe('listRemoteFollowerInboxPage', () => {
  it('bounds and orders each page before applying the strict cursor', async () => {
    const user = await createTestUserDirect()
    const actors = await Promise.all([
      createFollowingRemoteActor(`page-a-${randomSuffix()}.example`, user.id),
      createFollowingRemoteActor(`page-b-${randomSuffix()}.example`, user.id),
      createFollowingRemoteActor(`page-c-${randomSuffix()}.example`, user.id),
    ])
    const orderedIds = actors.map(actor => actor.id).sort()

    const firstPage = await listRemoteFollowerInboxPage(user.id, null, 2)
    const secondPage = await listRemoteFollowerInboxPage(
      user.id,
      firstPage.at(-1)!.remoteActorId,
      2,
    )

    expect(firstPage.map(row => row.remoteActorId)).toEqual(orderedIds.slice(0, 2))
    expect(secondPage.map(row => row.remoteActorId)).toEqual(orderedIds.slice(2))
  })

  it('uses a strict remote-actor cursor', async () => {
    const user = await createTestUserDirect()
    const first = await createFollowingRemoteActor(`first-${randomSuffix()}.example`, user.id)
    const second = await createFollowingRemoteActor(`second-${randomSuffix()}.example`, user.id)
    const ordered = [first, second].sort((a, b) => a.id.localeCompare(b.id))

    const page = await listRemoteFollowerInboxPage(user.id, ordered[0]!.id, 501)

    expect(page.map(row => row.remoteActorId)).toEqual([ordered[1]!.id])
  })
  it('includes a follower whose instance has no directory entry at all', async () => {
    const user = await createTestUserDirect()
    const hostname = `undirectoried-${randomSuffix()}.example`
    const remoteActor = await createFollowingRemoteActor(hostname, user.id)

    const urls = await collectInboxUrls(user.id)

    expect(urls).toContain(remoteActor.inbox_url)
  })

  it('includes a follower whose instance is only pending review', async () => {
    const user = await createTestUserDirect()
    const hostname = `pending-${randomSuffix()}.example`
    await createFediverseInstanceTopic(hostname, 'pending')
    const remoteActor = await createFollowingRemoteActor(hostname, user.id)

    const urls = await collectInboxUrls(user.id)

    expect(urls).toContain(remoteActor.inbox_url)
  })

  it('includes a follower whose instance is approved', async () => {
    const user = await createTestUserDirect()
    const hostname = `approved-${randomSuffix()}.example`
    await createFediverseInstanceTopic(hostname, 'approved')
    const remoteActor = await createFollowingRemoteActor(hostname, user.id)

    const urls = await collectInboxUrls(user.id)

    expect(urls).toContain(remoteActor.inbox_url)
  })

  it('excludes a follower whose instance has been blocked', async () => {
    const user = await createTestUserDirect()
    const hostname = `blocked-${randomSuffix()}.example`
    const topicId = await createFediverseInstanceTopic(hostname, 'approved')
    const remoteActor = await createFollowingRemoteActor(hostname, user.id)

    await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'blocked' })

    const urls = await collectInboxUrls(user.id)

    expect(urls).not.toContain(remoteActor.inbox_url)
  })

  it('retains a blocked follower as a cursor candidate with no delivery inbox', async () => {
    const user = await createTestUserDirect()
    const hostname = `cursor-blocked-${randomSuffix()}.example`
    const topicId = await createFediverseInstanceTopic(hostname, 'approved')
    const remoteActor = await createFollowingRemoteActor(hostname, user.id)
    await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'blocked' })

    const page = await listRemoteFollowerInboxPage(user.id, null, 501)

    expect(page).toContainEqual({ remoteActorId: remoteActor.id, inboxUrl: null })
  })

  it('restores delivery immediately after an instance is unblocked', async () => {
    const user = await createTestUserDirect()
    const hostname = `unblocked-${randomSuffix()}.example`
    const topicId = await createFediverseInstanceTopic(hostname, 'approved')
    const remoteActor = await createFollowingRemoteActor(hostname, user.id)
    await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'blocked' })
    expect(await collectInboxUrls(user.id)).not.toContain(remoteActor.inbox_url)

    await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'approved' })

    const urls = await collectInboxUrls(user.id)
    expect(urls).toContain(remoteActor.inbox_url)
  })
})
