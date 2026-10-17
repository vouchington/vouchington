import { describe, expect, it } from 'vitest'

import { splitCommandSegments } from '../command-match.mts'

describe('splitCommandSegments', () => {
  it('splits unquoted compound-command operators into separate segments', () => {
    expect(splitCommandSegments('git status && git push')).toEqual([
      ['git', 'status'],
      ['git', 'push'],
    ])
  })

  it('groups a quoted span, including internal whitespace, into a single word', () => {
    expect(splitCommandSegments('git commit -m "fix: git push behavior"')).toEqual([
      ['git', 'commit', '-m', 'fix: git push behavior'],
    ])
  })

  it('returns a single empty-array-free segment for a plain command with no operators', () => {
    expect(splitCommandSegments('cat foo.txt')).toEqual([['cat', 'foo.txt']])
  })
})
