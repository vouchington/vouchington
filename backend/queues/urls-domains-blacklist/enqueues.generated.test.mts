import { it, expect, describe } from 'vitest'
import {
  enqueueBlacklistDispatcher,
  enqueueSourceSync,
  enqueueBulkSourceSyncs,
} from './enqueues.mts'
import type { BlacklistSourceSyncData } from './types.mts'

describe('enqueues.generated', () => {
  it('enqueueBlacklistDispatcher enqueues without error', async () => {
    await expect(enqueueBlacklistDispatcher()).resolves.toBeDefined()
  })

  it('enqueueSourceSync enqueues without error', async () => {
    const data: BlacklistSourceSyncData = {
      sourceId: 1,
    }

    await expect(enqueueSourceSync(data)).resolves.toBeDefined()
  })

  it('enqueueSourceSync accepts delay parameter', async () => {
    const data: BlacklistSourceSyncData = {
      sourceId: 1,
    }

    await expect(enqueueSourceSync(data, 60000)).resolves.toBeDefined()
  })

  it('enqueueBulkSourceSyncs handles empty array', async () => {
    expect(await enqueueBulkSourceSyncs([])).toBeUndefined()
  })

  it('enqueueBulkSourceSyncs enqueues multiple syncs', async () => {
    const dataList: BlacklistSourceSyncData[] = [{ sourceId: 1 }, { sourceId: 2 }, { sourceId: 3 }]

    await expect(enqueueBulkSourceSyncs(dataList)).resolves.toBeDefined()
  })
})
