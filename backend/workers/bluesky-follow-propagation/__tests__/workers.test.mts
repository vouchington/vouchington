import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { processBlueskyFollowPropagationJob } from '../workers.mts'

function makeJob(name: string, data: unknown): Job {
  return { name, data } as Job
}

describe('processBlueskyFollowPropagationJob', () => {
  it('dispatches a known job name to its processor', async () => {
    const job = makeJob('reconcileFollow', {
      followerUserId: randomUUID(),
      followeeUserId: randomUUID(),
    })

    await expect(processBlueskyFollowPropagationJob(job)).resolves.toBeUndefined()
  })

  it('rejects an unknown job name', async () => {
    await expect(processBlueskyFollowPropagationJob(makeJob('unknownJob', {}))).rejects.toThrow(
      'Bluesky follow propagation job unknownJob not found',
    )
  })
})
