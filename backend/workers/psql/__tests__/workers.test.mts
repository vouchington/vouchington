import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { psql as psqlQueue } from '@queues/psql/queues'
import { psql as psqlWorker } from '../workers.mts'

describe('psql worker', () => {
  beforeEach(async () => {
    await psqlQueue.obliterate({ force: true })
  })

  afterAll(async () => {
    await psqlWorker.close()
  })

  it('rejects refreshMaterializedView jobs missing viewName', async () => {
    await expect(
      psqlQueue.add(
        'refreshMaterializedView',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('refreshMaterializedView job requires data.viewName')
  })

  it('rejects unknown jobs', async () => {
    await expect(
      psqlQueue.add(
        'missingJob',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('Unknown job: missingJob')
  })
})
