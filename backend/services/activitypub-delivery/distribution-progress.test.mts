import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUserDirect,
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
  insertTestTopic,
  insertTestUrlHostname,
  hardDeleteTestUser,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow, upsertEntityRelation } from '@services/entity-relations'
import { getOrFetchRemoteActorByKeyId, type RemoteFollowerInboxRow } from '@services/remote-actors'
import {
  commitActivityDistributionPage,
  prepareActivityDistributionPage,
} from './distribution-progress.mts'
import {
  makeJsonResponse,
  VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM,
} from '@voucha/test-helpers/remote-actor-fixtures'

const FOLLOW_RELATION = {
  subjectType: 'remote_actor',
  objectType: 'user',
  predicate: 'follow',
} as const

async function createFollowingRemoteActor(
  targetUserId: string,
  sharedInboxUrl?: string,
  hostname?: string,
) {
  const suffix = Math.random().toString(36).slice(2, 10)
  const actorUri = `https://${hostname ?? `checkpoint-${suffix}.example`}/users/actor`
  const keyId = `${actorUri}#main-key`
  const remoteActor = await getOrFetchRemoteActorByKeyId(keyId, {
    fetchWithTimeout: async () => ({
      response: makeJsonResponse({
        id: actorUri,
        inbox: `${actorUri}/inbox`,
        ...(sharedInboxUrl ? { endpoints: { sharedInbox: sharedInboxUrl } } : {}),
        publicKey: { id: keyId, publicKeyPem: VALID_REMOTE_ACTOR_PUBLIC_KEY_PEM },
      }),
      responseSignal: new AbortController().signal,
    }),
    validateUrl: async () => [{ address: '93.184.216.34', family: 4 as const }],
  })
  await upsertEntityRelation(
    null,
    getEntityRelationMetadataOrThrow(FOLLOW_RELATION),
    { id: remoteActor.id },
    [{ id: targetUserId }],
    { origin: 'remote' },
  )
  return remoteActor
}

async function createBlockedFollower(targetUserId: string) {
  const suffix = Math.random().toString(36).slice(2, 10)
  const owner = await createTestUserDirect()
  const hostname = `checkpoint-blocked-${suffix}.example`
  const hostnameId = await insertTestUrlHostname({ hostname })
  const topicId = await insertTestTopic({
    name: `Checkpoint blocked ${suffix}`,
    slug: `checkpoint-blocked-${suffix}`,
    createdById: owner.id,
    topicType: 'fediverse_instance',
    hostnameId,
  })
  await insertTestFediverseInstanceExtension({ topicId, software: 'mastodon' })
  const actor = await createFollowingRemoteActor(targetUserId, undefined, hostname)
  await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'blocked' })
  return actor
}

describe('ActivityPub distribution progress', () => {
  it('prepares an empty terminal page without advancing the cursor', async () => {
    const sourceUser = await createTestUserDirect()
    const activityId = uuidv7()

    const page = await prepareActivityDistributionPage(activityId, sourceUser.id)

    expect(page).toMatchObject({
      status: 'ready',
      expectedRemoteActorId: null,
      nextRemoteActorId: null,
      inboxUrls: [],
      hasMore: false,
    })
  })

  it('rejects reuse of one activity identity by another source user', async () => {
    const firstSource = await createTestUserDirect()
    const secondSource = await createTestUserDirect()
    const activityId = uuidv7()
    await prepareActivityDistributionPage(activityId, firstSource.id)

    await expect(prepareActivityDistributionPage(activityId, secondSource.id)).rejects.toThrow(
      `ActivityPub distribution source mismatch: ${activityId}`,
    )
  })

  it('allows only one compare-and-swap winner and retains terminal completion', async () => {
    const sourceUser = await createTestUserDirect()
    const activityId = uuidv7()
    const page = await prepareActivityDistributionPage(activityId, sourceUser.id)
    if (page.status !== 'ready') throw new Error('Expected a ready page')

    const commits = await Promise.all([
      commitActivityDistributionPage(activityId, sourceUser.id, null, null, true, page.leaseToken),
      commitActivityDistributionPage(activityId, sourceUser.id, null, null, true, page.leaseToken),
    ])

    expect(commits.toSorted()).toEqual([false, true])
    await expect(prepareActivityDistributionPage(activityId, sourceUser.id)).resolves.toEqual({
      status: 'completed',
    })
  })

  it('cascades a source-user deletion instead of retaining a checkpoint', async () => {
    const sourceUser = await createTestUserDirect()
    const activityId = uuidv7()
    await prepareActivityDistributionPage(activityId, sourceUser.id)

    await hardDeleteTestUser(sourceUser.id)

    await expect(prepareActivityDistributionPage(activityId, sourceUser.id)).rejects.toMatchObject({
      constraint: 'activitypub_distribution_work_items_source_user_id_fkey',
    })
  })

  it('does not rewind when the checkpoint cursor actor is no longer eligible to resolve', async () => {
    const sourceUser = await createTestUserDirect()
    const activityId = uuidv7()
    const cursorActorId = uuidv7()
    const nextActorId = uuidv7()
    const ordered = [cursorActorId, nextActorId].toSorted()
    const listAfterRemovedCursor = async (
      _sourceUserId: string,
      afterRemoteActorId: string | null,
      limit: number,
    ): Promise<RemoteFollowerInboxRow[]> =>
      [
        {
          remoteActorId: ordered[1]!,
          inboxUrl: 'https://after-removed-cursor.example/inbox',
        },
      ]
        .filter(candidate => !afterRemoteActorId || candidate.remoteActorId > afterRemoteActorId)
        .slice(0, limit)

    const page = await prepareActivityDistributionPage(activityId, sourceUser.id, {
      listRemoteFollowerInboxPage: async (_sourceUserId, _afterRemoteActorId, limit) =>
        [
          { remoteActorId: ordered[0]!, inboxUrl: 'https://removed-cursor.example/inbox' },
          { remoteActorId: ordered[1]!, inboxUrl: 'https://after-removed-cursor.example/inbox' },
        ].slice(0, limit),
    })
    if (page.status !== 'ready') throw new Error('Expected a ready page')
    await expect(
      commitActivityDistributionPage(
        activityId,
        sourceUser.id,
        null,
        ordered[0]!,
        false,
        page.leaseToken,
      ),
    ).resolves.toBe(true)

    await expect(
      prepareActivityDistributionPage(activityId, sourceUser.id, {
        listRemoteFollowerInboxPage: listAfterRemovedCursor,
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      expectedRemoteActorId: ordered[0],
      nextRemoteActorId: ordered[1],
    })
  })

  it('collapses shared inboxes within one prepared page', async () => {
    const sourceUser = await createTestUserDirect()
    const sharedInboxUrl = `https://shared-${Math.random().toString(36).slice(2, 10)}.example/inbox`
    await createFollowingRemoteActor(sourceUser.id, sharedInboxUrl)
    await createFollowingRemoteActor(sourceUser.id, sharedInboxUrl)

    const page = await prepareActivityDistributionPage(uuidv7(), sourceUser.id)

    expect(page).toMatchObject({ status: 'ready', inboxUrls: [sharedInboxUrl] })
  })

  it('advances and completes an all-ineligible candidate page', async () => {
    const sourceUser = await createTestUserDirect()
    const blockedFollower = await createBlockedFollower(sourceUser.id)
    const activityId = uuidv7()

    const page = await prepareActivityDistributionPage(activityId, sourceUser.id)

    expect(page).toMatchObject({
      status: 'ready',
      expectedRemoteActorId: null,
      nextRemoteActorId: blockedFollower.id,
      inboxUrls: [],
      hasMore: false,
    })
    if (page.status !== 'ready') throw new Error('Expected a ready candidate page')
    await expect(
      commitActivityDistributionPage(
        activityId,
        sourceUser.id,
        page.expectedRemoteActorId,
        page.nextRemoteActorId,
        !page.hasMore,
        page.leaseToken,
      ),
    ).resolves.toBe(true)
    await expect(prepareActivityDistributionPage(activityId, sourceUser.id)).resolves.toEqual({
      status: 'completed',
    })
  })

  it('resumes strictly after a committed follower cursor', async () => {
    const sourceUser = await createTestUserDirect()
    const first = await createFollowingRemoteActor(sourceUser.id)
    const second = await createFollowingRemoteActor(sourceUser.id)
    const ordered = [first, second].toSorted((a, b) => a.id.localeCompare(b.id))
    const activityId = uuidv7()

    const firstPage = await prepareActivityDistributionPage(activityId, sourceUser.id)

    expect(firstPage).toMatchObject({ status: 'ready', expectedRemoteActorId: null })
    if (firstPage.status !== 'ready') throw new Error('Expected a ready first page')
    const committed = await commitActivityDistributionPage(
      activityId,
      sourceUser.id,
      null,
      ordered[0]!.id,
      false,
      firstPage.leaseToken,
    )
    expect(committed).toBe(true)

    const resumedPage = await prepareActivityDistributionPage(activityId, sourceUser.id)

    expect(resumedPage).toMatchObject({
      status: 'ready',
      expectedRemoteActorId: ordered[0]!.id,
      nextRemoteActorId: ordered[1]!.id,
      inboxUrls: [`${ordered[1]!.actor_uri}/inbox`],
    })
  })
})
