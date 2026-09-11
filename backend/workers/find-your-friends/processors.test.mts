import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AccountToSync,
  streamFacebookAccountsToSync,
  streamXAccountsToSync,
  streamGithubAccountsToSync,
} from '@services/friend-recommendations/accounts-to-sync'
import type {
  enqueueBulkSyncFacebookFriends,
  enqueueBulkSyncXFriends,
  enqueueBulkSyncGithubFriends,
} from '@queues/find-your-friends/enqueues'
import { processFindYourFriendsDispatcher } from './processors.mts'

const mockStreamFacebookAccountsToSync = vi.fn<typeof streamFacebookAccountsToSync>()
const mockStreamXAccountsToSync = vi.fn<typeof streamXAccountsToSync>()
const mockStreamGithubAccountsToSync = vi.fn<typeof streamGithubAccountsToSync>()
const mockEnqueueBulkSyncFacebookFriends = vi.fn<typeof enqueueBulkSyncFacebookFriends>()
const mockEnqueueBulkSyncXFriends = vi.fn<typeof enqueueBulkSyncXFriends>()
const mockEnqueueBulkSyncGithubFriends = vi.fn<typeof enqueueBulkSyncGithubFriends>()

async function* createMockStream(ids: string[]): AsyncGenerator<AccountToSync> {
  for (const id of ids) {
    yield { provider_user_id: id }
  }
}

function generateIds(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}_${i}`)
}

describe('processors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStreamFacebookAccountsToSync.mockReturnValue(createMockStream([]))
    mockStreamXAccountsToSync.mockReturnValue(createMockStream([]))
    mockStreamGithubAccountsToSync.mockReturnValue(createMockStream([]))
    mockEnqueueBulkSyncFacebookFriends.mockResolvedValue()
    mockEnqueueBulkSyncXFriends.mockResolvedValue()
    mockEnqueueBulkSyncGithubFriends.mockResolvedValue()
  })

  describe('processFindYourFriendsDispatcher', () => {
    it('returns zero count when no accounts to sync', async () => {
      const result = await runDispatcher()
      expect(result).toEqual({ count: 0 })
      expect(mockEnqueueBulkSyncFacebookFriends).not.toHaveBeenCalled()
      expect(mockEnqueueBulkSyncXFriends).not.toHaveBeenCalled()
      expect(mockEnqueueBulkSyncGithubFriends).not.toHaveBeenCalled()
    })

    it('enqueues a single batch when accounts fit within batch size', async () => {
      const fbIds = generateIds(50, 'fb')
      mockStreamFacebookAccountsToSync.mockReturnValue(createMockStream(fbIds))

      const result = await runDispatcher()

      expect(result).toEqual({ count: 50 })
      expect(mockEnqueueBulkSyncFacebookFriends).toHaveBeenCalledTimes(1)
      expect(mockEnqueueBulkSyncFacebookFriends).toHaveBeenCalledWith(fbIds)
    })

    it('batches 2500 accounts into 3 enqueue calls (1000, 1000, 500)', async () => {
      const fbIds = generateIds(2500, 'fb')
      mockStreamFacebookAccountsToSync.mockReturnValue(createMockStream(fbIds))

      const result = await runDispatcher()

      expect(result).toEqual({ count: 2500 })
      expect(mockEnqueueBulkSyncFacebookFriends).toHaveBeenCalledTimes(3)
      expect(mockEnqueueBulkSyncFacebookFriends.mock.calls[0]![0]).toHaveLength(1000)
      expect(mockEnqueueBulkSyncFacebookFriends.mock.calls[1]![0]).toHaveLength(1000)
      expect(mockEnqueueBulkSyncFacebookFriends.mock.calls[2]![0]).toHaveLength(500)
    })

    it('batches exactly 1000 accounts into 1 enqueue call', async () => {
      const ghIds = generateIds(1000, 'gh')
      mockStreamGithubAccountsToSync.mockReturnValue(createMockStream(ghIds))

      const result = await runDispatcher()

      expect(result).toEqual({ count: 1000 })
      expect(mockEnqueueBulkSyncGithubFriends).toHaveBeenCalledTimes(1)
      expect(mockEnqueueBulkSyncGithubFriends.mock.calls[0]![0]).toHaveLength(1000)
    })

    it('counts across all providers', async () => {
      mockStreamFacebookAccountsToSync.mockReturnValue(createMockStream(generateIds(10, 'fb')))
      mockStreamXAccountsToSync.mockReturnValue(createMockStream(generateIds(20, 'x')))
      mockStreamGithubAccountsToSync.mockReturnValue(createMockStream(generateIds(30, 'gh')))

      const result = await runDispatcher()

      expect(result).toEqual({ count: 60 })
      expect(mockEnqueueBulkSyncFacebookFriends).toHaveBeenCalledTimes(1)
      expect(mockEnqueueBulkSyncXFriends).toHaveBeenCalledTimes(1)
      expect(mockEnqueueBulkSyncGithubFriends).toHaveBeenCalledTimes(1)
    })
  })
})

function runDispatcher(): Promise<{ count: number }> {
  return processFindYourFriendsDispatcher({
    enqueueBulkSyncFacebookFriends: mockEnqueueBulkSyncFacebookFriends,
    enqueueBulkSyncGithubFriends: mockEnqueueBulkSyncGithubFriends,
    enqueueBulkSyncXFriends: mockEnqueueBulkSyncXFriends,
    streamFacebookAccountsToSync: mockStreamFacebookAccountsToSync,
    streamGithubAccountsToSync: mockStreamGithubAccountsToSync,
    streamXAccountsToSync: mockStreamXAccountsToSync,
  })
}
