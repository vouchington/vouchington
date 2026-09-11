import { beforeEach, describe, expect, it } from 'vitest'
import { createTestUser, pollUntilNotNull } from '@voucha/test-helpers'
import { cachePurge } from '@queues/cache-purge/queues'
import { createMyLandingPage } from './create.mts'

const QUEUE_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const

async function getCachePurgeTags(): Promise<string[]> {
  const jobs = await Promise.all(QUEUE_STATES.map(state => cachePurge.getJobs(state)))
  return jobs
    .flat()
    .flatMap(job => (job.data as { tags?: unknown[] } | undefined)?.tags ?? [])
    .filter((tag): tag is string => typeof tag === 'string')
}

async function waitForCachePurgeTags(expected: string[]): Promise<string[]> {
  return (await pollUntilNotNull(async () => {
    const tags = await getCachePurgeTags()
    return expected.every(tag => tags.includes(tag)) ? tags : null
  })) as string[]
}

describe('createMyLandingPage', () => {
  beforeEach(async () => {
    await cachePurge.obliterate({ force: true })
  })

  it('enqueues a user cache purge tag for the public landing page routes', async () => {
    const user = await createTestUser()

    await createMyLandingPage(user.id, { title: 'Landing page cache test', slug: 'cache-test' })

    await expect(waitForCachePurgeTags([`user:${user.username!}`])).resolves.toEqual(
      expect.arrayContaining([`user:${user.username!}`]),
    )
  })
})
