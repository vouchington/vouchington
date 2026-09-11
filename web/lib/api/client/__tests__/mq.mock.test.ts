import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import {
  fetchBackfills,
  fetchQueueStats,
  fetchQueues,
  fetchScheduledJobs,
  pauseQueue,
  resumeQueue,
  triggerBackfill,
  triggerScheduledJob,
} from '../mq'
import { clientApi } from '../instance'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('mq client — queues', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchQueues', () => {
    it('GETs the queues endpoint', async () => {
      const mockResponse = {
        queues: [
          { name: 'ai_agents', waiting: 0, active: 1, completed: 10, failed: 0, paused: false },
        ],
        total: 1,
      }
      mockGet.mockResolvedValueOnce(mockResponse)

      const result = await fetchQueues()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/mq/queues')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('fetchQueueStats', () => {
    it('GETs the queue stats endpoint', async () => {
      const mockResponse = {
        stats: {
          totalWaiting: 1,
          totalActive: 2,
          totalCompleted: 3,
          totalFailed: 4,
          queueCount: 5,
        },
      }
      mockGet.mockResolvedValueOnce(mockResponse)

      const result = await fetchQueueStats()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/mq/stats')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('pauseQueue', () => {
    it('POSTs the pause endpoint with the encoded queue name', async () => {
      const mockResponse = { success: true }
      mockPost.mockResolvedValueOnce(mockResponse)

      const result = await pauseQueue('alerts')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/mq/queues/alerts/pause')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('resumeQueue', () => {
    it('POSTs the resume endpoint with the encoded queue name', async () => {
      const mockResponse = { success: true }
      mockPost.mockResolvedValueOnce(mockResponse)

      const result = await resumeQueue('alerts')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/mq/queues/alerts/resume')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('fetchScheduledJobs', () => {
    it('GETs the scheduled jobs endpoint', async () => {
      const mockResponse = {
        jobs: [
          {
            id: 'kagi-smallweb-sync',
            queue_name: 'kagi-smallweb',
            job_name: 'sync',
            schedule: '0 5 * * *',
            description: 'Sync Kagi Small Web data',
          },
        ],
      }
      mockGet.mockResolvedValueOnce(mockResponse)

      const result = await fetchScheduledJobs()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/mq/scheduled-jobs')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('triggerScheduledJob', () => {
    it('POSTs the scheduled job trigger endpoint with the encoded id', async () => {
      const mockResponse = { success: true }
      mockPost.mockResolvedValueOnce(mockResponse)

      const result = await triggerScheduledJob('kagi-smallweb-sync')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/mq/scheduled-jobs/kagi-smallweb-sync/runs')
      expect(result).toEqual(mockResponse)
    })
  })
})

describe('mq client — backfills', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchBackfills', () => {
    it('GETs the backfills endpoint', async () => {
      const mockResponse = {
        backfills: [
          {
            id: 'openai-moderation-posts',
            queue_name: 'openai_moderation_omni_single',
            job_name: 'backfill_posts',
            description: 'Backfill OpenAI moderation for posts missing results',
            source_table: 'posts',
          },
        ],
      }
      mockGet.mockResolvedValueOnce(mockResponse)

      const result = await fetchBackfills()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/mq/backfills')
      expect(result).toEqual(mockResponse)
    })
  })

  describe('triggerBackfill', () => {
    it('POSTs to the backfill trigger endpoint with the encoded id', async () => {
      const mockResponse = { success: true }
      mockPost.mockResolvedValueOnce(mockResponse)

      const result = await triggerBackfill('openai-moderation-posts')

      expect(mockPost).toHaveBeenCalledWith('/api/v1/mq/backfills/openai-moderation-posts/runs')
      expect(result).toEqual(mockResponse)
    })

    it('encodes special characters in the backfill id', async () => {
      mockPost.mockResolvedValueOnce({ success: true })

      await triggerBackfill('backfill with spaces/slashes')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/mq/backfills/backfill%20with%20spaces%2Fslashes/runs',
      )
    })
  })
})
