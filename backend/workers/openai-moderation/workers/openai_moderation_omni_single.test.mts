import { afterAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import {
  openai_moderation_omni_single,
  processOpenAIModerationOmniSingleJob,
} from './openai_moderation_omni_single.mts'

describe('OpenAI moderation omni worker entrypoint', () => {
  afterAll(async () => {
    await openai_moderation_omni_single.close()
  })

  it('rejects a job that does not include an image id', async () => {
    await expect(
      processOpenAIModerationOmniSingleJob({ data: {}, name: 'image' } as Job<{ id?: string }>),
    ).rejects.toThrow('Image job requires id in job.data')
  })
})
