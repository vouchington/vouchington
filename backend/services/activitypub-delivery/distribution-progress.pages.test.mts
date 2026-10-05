import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers'
import type { RemoteFollowerInboxRow } from '@services/remote-actors'
import { expireActivityDistributionLeaseForTest } from '@voucha/test-helpers/activitypub-distribution-lease'
import {
  commitActivityDistributionPage,
  prepareActivityDistributionPage,
  releaseActivityDistributionPage,
} from './distribution-progress.mts'

describe('ActivityPub distribution leased pages', () => {
  it('rejects stale completion and release after an expired lease is reclaimed', async () => {
    const source = await createTestUserDirect()
    const activityId = uuidv7()
    const first = await prepareActivityDistributionPage(activityId, source.id)
    if (first.status !== 'ready') throw new Error('Expected a ready first page')
    await expireActivityDistributionLeaseForTest(activityId, first.leaseToken)
    const successor = await prepareActivityDistributionPage(activityId, source.id)
    if (successor.status !== 'ready') throw new Error('Expected a ready successor page')
    expect(successor.leaseToken).not.toBe(first.leaseToken)

    await releaseActivityDistributionPage(activityId, first.leaseToken)
    await expect(prepareActivityDistributionPage(activityId, source.id)).resolves.toMatchObject({
      status: 'busy',
    })
    await expect(
      commitActivityDistributionPage(activityId, source.id, null, null, true, first.leaseToken),
    ).resolves.toBe(false)
    await expect(
      commitActivityDistributionPage(activityId, source.id, null, null, true, successor.leaseToken),
    ).resolves.toBe(true)
  })

  it('bounds a 501-candidate page and retries an uncommitted later page from its cursor', async () => {
    const sourceUser = await createTestUserDirect()
    const activityId = uuidv7()
    const candidates = Array.from({ length: 501 }, () => uuidv7())
      .toSorted()
      .map((remoteActorId, index) => ({
        remoteActorId,
        inboxUrl: `https://candidate-${index}.example/inbox`,
      })) satisfies RemoteFollowerInboxRow[]
    const listCandidates = async (
      _sourceUserId: string,
      afterRemoteActorId: string | null,
      limit: number,
    ): Promise<RemoteFollowerInboxRow[]> =>
      candidates
        .filter(candidate => !afterRemoteActorId || candidate.remoteActorId > afterRemoteActorId)
        .slice(0, limit)

    const firstPage = await prepareActivityDistributionPage(activityId, sourceUser.id, {
      listRemoteFollowerInboxPage: listCandidates,
    })

    expect(firstPage).toMatchObject({
      status: 'ready',
      nextRemoteActorId: candidates[499]!.remoteActorId,
      hasMore: true,
    })
    if (firstPage.status !== 'ready') throw new Error('Expected a ready first candidate page')
    expect(firstPage.inboxUrls).toHaveLength(500)
    await expect(
      commitActivityDistributionPage(
        activityId,
        sourceUser.id,
        firstPage.expectedRemoteActorId,
        firstPage.nextRemoteActorId,
        false,
        firstPage.leaseToken,
      ),
    ).resolves.toBe(true)

    const failedLaterPage = await prepareActivityDistributionPage(activityId, sourceUser.id, {
      listRemoteFollowerInboxPage: listCandidates,
    })
    if (failedLaterPage.status !== 'ready') throw new Error('Expected a ready later page')
    await expect(prepareActivityDistributionPage(activityId, sourceUser.id)).resolves.toMatchObject(
      {
        status: 'busy',
      },
    )
    await releaseActivityDistributionPage(activityId, failedLaterPage.leaseToken)
    const retryLaterPage = await prepareActivityDistributionPage(activityId, sourceUser.id, {
      listRemoteFollowerInboxPage: listCandidates,
    })

    expect(failedLaterPage).toMatchObject({
      status: 'ready',
      expectedRemoteActorId: candidates[499]!.remoteActorId,
      nextRemoteActorId: candidates[500]!.remoteActorId,
      inboxUrls: [candidates[500]!.inboxUrl],
      hasMore: false,
    })
    expect(retryLaterPage).toMatchObject({ ...failedLaterPage, leaseToken: expect.any(String) })
    if (retryLaterPage.status !== 'ready') throw new Error('Expected a ready retry page')
    expect(retryLaterPage.leaseToken).not.toBe(failedLaterPage.leaseToken)
  })
})
