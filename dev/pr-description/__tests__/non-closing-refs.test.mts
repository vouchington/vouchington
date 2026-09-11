import { describe, expect, it } from 'vitest'

import { parseNonClosingRefs } from '../non-closing-refs.mts'

describe('parseNonClosingRefs', () => {
  it('parses a bare Refs entry in the Related issues section', () => {
    const body = '## Related issues\n\nRefs #7944 — tracked separately, still needs a follow-up PR'
    expect(parseNonClosingRefs(body)).toEqual(new Set(['#7944']))
  })

  it('parses a "Part of" entry', () => {
    const body = '## Related issues\n\nPart of #7944, remainder ships next PR'
    expect(parseNonClosingRefs(body)).toEqual(new Set(['#7944']))
  })

  it('parses a qualified owner/repo entry and lowercases it', () => {
    const body = '## Related issues\n\nRefs Other/Repo#42 — unrelated issue in another repo'
    expect(parseNonClosingRefs(body)).toEqual(new Set(['other/repo#42']))
  })

  it('ignores a Refs entry outside the Related issues section', () => {
    const body = 'Refs #7944 — tracked separately, still needs a follow-up PR'
    expect(parseNonClosingRefs(body)).toEqual(new Set())
  })

  it('ignores an unrelated heading that merely mentions "related"', () => {
    const body = '## Related work\n\nRefs #7944'
    expect(parseNonClosingRefs(body)).toEqual(new Set())
  })

  it('parses multiple entries and returns a deduplicated set', () => {
    const body = '## Related issues\n\nRefs #1\nRefs #1\nPart of #2'
    expect(parseNonClosingRefs(body)).toEqual(new Set(['#1', '#2']))
  })

  it('returns an empty set for a body with no Related issues section', () => {
    expect(parseNonClosingRefs('no related mentions here')).toEqual(new Set())
  })

  it('does not match a bare "ref" without a following colon or #', () => {
    const body = '## Related issues\n\nSee the reference implementation for details'
    expect(parseNonClosingRefs(body)).toEqual(new Set())
  })
})
