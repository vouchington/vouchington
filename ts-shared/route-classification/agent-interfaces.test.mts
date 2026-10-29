import { describe, expect, it } from 'vitest'
import { buildAdvertisedAgentInterfaceUrls } from './agent-interfaces.mts'
import { isPrivateDiscoveryPath } from './discovery.mts'

const SITE_ORIGIN = 'https://voucha.ai'
const advertisedPaths = Object.values(buildAdvertisedAgentInterfaceUrls(SITE_ORIGIN)).map(
  url => new URL(url).pathname,
)

describe('advertised agent interface paths', () => {
  it.each(advertisedPaths)('keeps %s private so it never carries discovery Link headers', path => {
    expect(isPrivateDiscoveryPath(path)).toBe(true)
  })

  it.each(advertisedPaths)('lists %s as an exact lowercase path without a trailing slash', path => {
    expect(path).toMatch(/^\/[a-z0-9/-]*[a-z0-9]$/)
  })

  it('never advertises an admin interface', () => {
    expect(advertisedPaths.filter(path => path.includes('admin'))).toEqual([])
  })
})

describe('buildAdvertisedAgentInterfaceUrls', () => {
  it('prefixes every advertised path with the site origin', () => {
    expect(buildAdvertisedAgentInterfaceUrls('https://staging.voucha.ai')).toEqual({
      userMcp: 'https://staging.voucha.ai/api/v1/mcp',
      apiKeySettings: 'https://staging.voucha.ai/my/api-keys',
    })
  })
})
