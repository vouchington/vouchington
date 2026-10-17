import { describe, expect, it } from 'vitest'

import { parsePullRequestRefOids } from '../supersession-hints.mts'

describe('parsePullRequestRefOids', () => {
  it('parses baseRefOid/headRefOid from a gh pr view response', () => {
    expect(
      parsePullRequestRefOids(JSON.stringify({ baseRefOid: 'aaa', headRefOid: 'bbb' })),
    ).toEqual({ baseRefOid: 'aaa', headRefOid: 'bbb' })
  })

  it('throws when baseRefOid is missing', () => {
    expect(() => parsePullRequestRefOids(JSON.stringify({ headRefOid: 'bbb' }))).toThrow(
      'gh pr view response missing baseRefOid/headRefOid',
    )
  })

  it('throws when headRefOid is missing', () => {
    expect(() => parsePullRequestRefOids(JSON.stringify({ baseRefOid: 'aaa' }))).toThrow(
      'gh pr view response missing baseRefOid/headRefOid',
    )
  })
})
