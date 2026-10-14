import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { contentAnalysisQueue } from '@queues/content-analysis/queues'
import { contentAnalysis } from './workers.mts'

describe('language detection worker', () => {
  beforeEach(async () => {
    await contentAnalysisQueue.obliterate({ force: true })
  })

  afterAll(async () => {
    await contentAnalysis.close()
  })

  it('rejects entity jobs missing an id', async () => {
    await expect(
      contentAnalysisQueue.add(
        'post',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Language detection job requires id in job.data')
  })

  it('rejects unknown entity jobs', async () => {
    await expect(
      contentAnalysisQueue.add(
        'missing',
        { id: 'post-1' },
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Unknown language detection entity type: missing')
  })
})
