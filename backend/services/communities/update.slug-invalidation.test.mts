import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUser, insertTestCommunity, readEnqueuedJob } from '@voucha/test-helpers'
import { CACHE_PURGE_TAGS_JOB } from '@queues/background/enqueues/cache-purge-jobs'
import { cachePurge } from '@queues/cache-purge/queues'
import { communityTag } from '../../../ts-shared/cache/cache-tags.mts'
import { onEnqueueAdmission } from '../../data-stores/valkey-glide-mq/glide-mq-admission.mts'
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

    const admissions: Promise<unknown>[] = []
    const off = onEnqueueAdmission(event => {
      if (
        event.queue === cachePurge &&
        event.jobName === CACHE_PURGE_TAGS_JOB.name &&
        event.inputs.some(
          input =>
            typeof input === 'object' &&
            input !== null &&
            'tags' in input &&
            Array.isArray(input.tags) &&
            input.tags.includes(communityTag(finalSlug)),
        )
      )
        admissions.push(event.completion)
      return undefined
    })
    try {
      await updateCommunity(user, community.id, { slug: finalSlug }, undefined, {
        community: loaded,
      })
      expect(admissions.length).toBeGreaterThan(0)
      const accepted = (await Promise.all(admissions)).flatMap(result =>
        Array.isArray(result) ? result : [result],
      )
      const jobs = await Promise.all(accepted.map(job => readEnqueuedJob(cachePurge, job)))
      const tags = jobs.flatMap(job => (job.data as { tags: string[] }).tags)
      expect(tags).toEqual(
        expect.arrayContaining(
          [loaded.id, loaded.slug, intermediateSlug, finalSlug].map(communityTag),
        ),
      )
      expect((await getCommunity(community.id))?.slug).toBe(finalSlug)
    } finally {
      off()
      await Promise.allSettled(admissions)
    }
  })
})
