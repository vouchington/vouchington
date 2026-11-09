import { describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { buildHostnameExclusionExists } from './hostname-exclusion-filter.mts'

describe('buildHostnameExclusionExists', () => {
  it('checks exact and parent hostnames for the viewer without expanding matching host IDs', () => {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const filter = buildHostnameExclusionExists(
      userId,
      sql`candidate_hostname.id`,
      sql`candidate_hostname.reversed_hostname`,
    )

    expect(filter.text).toContain('parent_hostname.id = candidate_hostname.id')
    expect(filter.text).toContain(
      "candidate_hostname.reversed_hostname LIKE parent_hostname.reversed_hostname || '.%'",
    )
    expect(filter.text).not.toContain('excluded_hostname_ids')
    expect(filter.values).toEqual([userId, userId, userId])
  })
})
