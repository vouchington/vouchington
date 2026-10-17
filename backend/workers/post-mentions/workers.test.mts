import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { POST_MENTIONS_PROCESS_JOB } from '@queues/background/enqueues/post-mentions-jobs'
import { postMentionsHandlers } from './workers.mts'

describe('post mentions handler', () => {
  it('rejects a job that carries no payload', async () => {
    const [handler] = postMentionsHandlers

    await expect(handler!.handle({ name: POST_MENTIONS_PROCESS_JOB.name } as Job)).rejects.toThrow(
      'Post mentions job .data is required',
    )
  })
})
