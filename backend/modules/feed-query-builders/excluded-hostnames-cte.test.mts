import { describe, expect, it } from 'vitest'
import { buildExcludedHostnameIdsCTE } from './excluded-hostnames-cte.mts'

describe('buildExcludedHostnameIdsCTE', () => {
  it('builds a parameterized CTE scoped to the user', () => {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const cte = buildExcludedHostnameIdsCTE(userId)

    expect(cte.text).toContain('excluded_hostnames AS (')
    expect(cte.text).toContain('excluded_hostname_ids AS (')
    expect(cte.values).toEqual([userId, userId])
  })
})
