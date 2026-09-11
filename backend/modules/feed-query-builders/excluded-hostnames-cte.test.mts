import { describe, expect, it } from 'vitest'
import {
  buildCommunityExcludedHostnameIdsCTE,
  buildExcludedHostnameIdsCTE,
} from './excluded-hostnames-cte.mts'

describe('buildExcludedHostnameIdsCTE', () => {
  it('builds a parameterized CTE scoped to the user', () => {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const cte = buildExcludedHostnameIdsCTE(userId)

    expect(cte.text).toContain('excluded_hostnames AS (')
    expect(cte.text).toContain('excluded_hostname_ids AS (')
    expect(cte.values).toEqual([userId, userId])
  })
})

describe('buildCommunityExcludedHostnameIdsCTE', () => {
  it('builds a parameterized CTE scoped to the community', () => {
    const communityId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const cte = buildCommunityExcludedHostnameIdsCTE(communityId)

    expect(cte.text).toContain('community_excluded_hostnames AS (')
    expect(cte.text).toContain('excluded_hostname_ids AS (')
    expect(cte.values).toEqual([communityId])
  })
})
