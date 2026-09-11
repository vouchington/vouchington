import { describe, expect, it } from 'vitest'

import { currentUserCanFilterHostnameModeration } from './authorization.mts'

describe('currentUserCanFilterHostnameModeration', () => {
  it('allows administrators to view hostname moderation fields', () => {
    expect(currentUserCanFilterHostnameModeration({ roles: ['administrator'] })).toBe(true)
  })

  it('denies anonymous or malformed session users', () => {
    expect(currentUserCanFilterHostnameModeration(null)).toBe(false)
    expect(currentUserCanFilterHostnameModeration({} as never)).toBe(false)
    expect(currentUserCanFilterHostnameModeration({ roles: [] })).toBe(false)
  })
})
