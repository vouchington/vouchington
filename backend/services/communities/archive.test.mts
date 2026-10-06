import { afterEach, describe, expect, it, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import * as psqlEnqueues from '@queues/psql/enqueues'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import * as cachePurgeEnqueues from '@queues/cache-purge/enqueues'
import { cachePurge } from '@queues/cache-purge/queues'
import { invalidate } from '@services/entity-cache/invalidate'
import { getCommunity } from './get.mts'
import { setCommunityArchiveState, updateCommunityAndSetArchiveState } from './archive.mts'

const QUEUE_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const

async function getCachePurgeTagsForCommunityKeys(keys: string[]): Promise<string[]> {
  const expectedTags = new Set(keys.map(key => `community:${key}`))
  const jobs = await Promise.all(QUEUE_STATES.map(state => cachePurge.getJobs(state)))
  return jobs
    .flat()
    .flatMap(job => (job.data as { tags?: unknown[] } | undefined)?.tags ?? [])
    .filter((tag): tag is string => typeof tag === 'string' && expectedTags.has(tag))
}

describe('setCommunityArchiveState', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 404 when the community does not exist', async () => {
    const user = await createTestUser({ administrator: true })

    await expect(setCommunityArchiveState(user, uuidv7(), true)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('requires delete permission', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })

    await expect(
      setCommunityArchiveState(member, community.id, true, membership),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('archives a community when the current user owns it', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const updated = await setCommunityArchiveState(owner, community.id, true, membership)

    expect(updated.archived_at).not.toBeNull()
    expect(updated.archived_by_id).toBe(owner.id)
    expect((await getCommunity(community.id))!.archived_at).not.toBeNull()
  })

  it('enqueues only when a standalone archive state mutation changes eligibility', async () => {
    const user = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: user.id })
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')

    await setCommunityArchiveState(user, community.id, false)
    expect(refreshTopHashtags).not.toHaveBeenCalled()

    await setCommunityArchiveState(user, community.id, true)
    expect(refreshTopHashtags).toHaveBeenCalledOnce()
  })
})

describe('updateCommunityAndSetArchiveState', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('commits the update and archive before invalidating every community cache key', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const membership = await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const newSlug = `updated-${uuidv7()}`
    let observedCommittedState = false
    const pendingPurges: Promise<unknown>[] = []
    const enqueuePurge = cachePurgeEnqueues.enqueueBulkPurgeCacheTags
    const purgeSpy = vi
      .spyOn(cachePurgeEnqueues, 'enqueueBulkPurgeCacheTags')
      .mockImplementation((tags, priority) => {
        const job = enqueuePurge(tags, priority)
        pendingPurges.push(job)
        return job
      })

    try {
      const updated = await updateCommunityAndSetArchiveState(
        owner,
        community.id,
        { slug: newSlug },
        true,
        membership,
        {
          invalidateCommunities: async (...keys) => {
            const committed = await getCommunity(community.id)
            expect(committed).toMatchObject({
              slug: newSlug,
              archived_by_id: owner.id,
            })
            expect(committed?.archived_at).not.toBeNull()
            observedCommittedState = true
            await invalidate.communities(...keys)
          },
        },
      )
      await Promise.all(pendingPurges)

      expect(observedCommittedState).toBe(true)
      expect(updated).toMatchObject({ slug: newSlug, archived_by_id: owner.id })
      expect(updated.archived_at).not.toBeNull()

      const communityKeys = [community.id, community.slug, newSlug]
      const cachePurgeTags = await getCachePurgeTagsForCommunityKeys(communityKeys)
      expect(new Set(cachePurgeTags)).toEqual(new Set(communityKeys.map(key => `community:${key}`)))
    } finally {
      purgeSpy.mockRestore()
    }
  })

  it('enqueues one refresh when its transaction changes visibility and archive state', async () => {
    const user = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')

    await updateCommunityAndSetArchiveState(user, community.id, { visibility: 'private' }, true)

    expect(refreshTopHashtags).toHaveBeenCalledOnce()
  })
})
