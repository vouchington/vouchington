import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { language_detection } from '@queues/language-detection/queues'
import { languageDetection } from './workers.mts'

describe('language detection worker', () => {
  beforeEach(async () => {
    await language_detection.obliterate({ force: true })
  })

  afterAll(async () => {
    await languageDetection.close()
  })

  it('rejects entity jobs missing an id', async () => {
    await expect(
      language_detection.add(
        'post',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Language detection job requires id in job.data')
  })

  it('rejects unknown entity jobs', async () => {
    await expect(
      language_detection.add(
        'missing',
        { id: 'post-1' },
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Unknown language detection entity type: missing')
  })
})
