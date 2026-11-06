import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { HackerNewsConfig } from '@/lib/hacker-news-config'
import { getHackerNewsConfig } from './hacker-news-config'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn<VitestLooseMock>() }))
vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: { get: mockGet },
    }) as unknown as typeof import('./instance'),
)

describe('critical Hacker News server configuration', () => {
  beforeEach(() => mockGet.mockReset())

  it.each([true, false])('returns the acknowledged visibility %s and range', async visible => {
    const response: HackerNewsConfig = { references_visible: visible, post_time_range_cap: 'all' }
    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: getHackerNewsConfig,
      expectedArgs: ['/api/v1/hacker-news-config'],
    })
  })

  it.each([
    new Error('configuration request timed out'),
    Object.assign(new Error('configuration API failed'), { status: 500 }),
  ])(
    'propagates an API failure instead of pretending references were disabled: %s',
    async failure => {
      mockGet.mockRejectedValueOnce(failure)
      await expect(getHackerNewsConfig()).rejects.toBe(failure)
    },
  )
})
