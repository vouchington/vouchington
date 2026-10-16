import { describe, expect, it, vi } from 'vitest'
import { defaultRobotsDependencies, fetchRobotsTxtWithRetry } from '../fetch-retry.mts'

const fetchWithTimeoutSimple = vi.hoisted(() =>
  vi.fn<typeof import('@modules/utils/http').fetchWithTimeoutSimple>(),
)

vi.mock<typeof import('@modules/utils/http')>(import('@modules/utils/http'), async original => ({
  ...(await original()),
  fetchWithTimeoutSimple,
}))

describe('fetchRobotsTxtWithRetry replaced http fetch', () => {
  it('uses the replaced integration fetch instead of resolving the hostname', async () => {
    fetchWithTimeoutSimple.mockReset()
    fetchWithTimeoutSimple.mockResolvedValue(
      new Response('User-agent: *\nAllow: /\n', { status: 200 }),
    )

    await expect(
      fetchRobotsTxtWithRetry('story-relation.example.test', {
        ...defaultRobotsDependencies,
        checkDomainBlacklisted: async () => false,
      }),
    ).resolves.toBe('User-agent: *\nAllow: /\n')

    expect(fetchWithTimeoutSimple).toHaveBeenCalledWith(
      'https://story-relation.example.test/robots.txt',
      10_000,
    )
  })
})
