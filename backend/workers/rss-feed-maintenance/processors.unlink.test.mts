import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { processRssFeedMaintenanceJob } from './processors.mts'

const job = (name: string, data?: unknown) => ({ name, data }) as unknown as Job

describe('topic alias unlink jobs', () => {
  it.each(['processUnlinkTopicAliasPage', 'processRecoverTopicAliasUnlinks'])(
    'requires data for %s',
    name => {
      expect(() => processRssFeedMaintenanceJob(job(name))).toThrow('.data is required')
    },
  )

  it('ignores a page for an alias that is no longer pending', async () => {
    const page = { topicAliasId: crypto.randomUUID(), phase: 'finalize', pageCursor: 'finalize' }

    await expect(
      processRssFeedMaintenanceJob(job('processUnlinkTopicAliasPage', page)),
    ).resolves.toBeNull()
  })

  it('recovers from the supplied cursor', async () => {
    const afterId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

    await expect(
      processRssFeedMaintenanceJob(job('processRecoverTopicAliasUnlinks', { afterId })),
    ).resolves.toBeUndefined()
  })
})
