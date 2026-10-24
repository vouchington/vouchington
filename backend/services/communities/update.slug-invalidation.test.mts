import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { CACHE_PURGE_TAGS_JOB } from '@queues/background/enqueues/cache-purge-jobs'
import { cachePurge } from '@queues/cache-purge/queues'
import { communityTag } from '../../../ts-shared/cache/cache-tags.mts'
import { getCommunity } from './get.mts'
import { updateCommunity } from './update.mts'

describe('community slug invalidation with a stale loaded community', () => {
  it('purges the actual previous slug after another rename commits', async () => {
    const user = await createTestUser({ administrator: true })
    const community = await insertTestCommunity({ createdById: user.id })
    const loaded = await getCommunity(community.id)
    if (!loaded) throw new Error('Missing created community')
    const intermediateSlug = `intermediate-${randomUUID()}`
    const finalSlug = `final-${randomUUID()}`
    await updateCommunity(user, community.id, { slug: intermediateSlug })

    const admissions: string[] = []
    const onAdded = (job: { id: string; name: string; data: unknown }) => {
      const data = job.data
      if (
        job.name === CACHE_PURGE_TAGS_JOB.name &&
        typeof data === 'object' &&
        data !== null &&
        'tags' in data &&
        Array.isArray(data.tags) &&
        data.tags.includes(communityTag(finalSlug))
      )
        admissions.push(job.id)
    }
    cachePurge.on('added', onAdded)
    try {
      await updateCommunity(user, community.id, { slug: finalSlug }, undefined, {
        community: loaded,
      })
      expect(admissions.length).toBeGreaterThan(0)
      const jobs = (await Promise.all(admissions.map(jobId => cachePurge.getJob(jobId)))).filter(
        (job): job is NonNullable<typeof job> => job !== null,
      )
      if (jobs.length !== admissions.length)
        throw new Error('Missing persisted community purge job')
      const tags = jobs.flatMap(job => (job.data as { tags: string[] }).tags)
      expect(tags).toEqual(
        expect.arrayContaining(
          [loaded.id, loaded.slug, intermediateSlug, finalSlug].map(communityTag),
        ),
      )
      expect((await getCommunity(community.id))?.slug).toBe(finalSlug)
    } finally {
      cachePurge.off('added', onAdded)
    }
  })
})
