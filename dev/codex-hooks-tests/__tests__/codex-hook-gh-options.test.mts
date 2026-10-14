import { describe, expect, it } from 'vitest'

import { parseGhOptions } from '../../codex-hooks/policy-helpers.mts'

const EMPTY = { body: [], bodyFile: [], draft: false, label: [], repo: [], title: [] }

describe('parseGhOptions', () => {
  it.each([
    [['--body', 'x'], { body: ['x'] }],
    [['-b', 'x'], { body: ['x'] }],
    [['--body=x'], { body: ['x'] }],
    [['-bx'], { body: ['x'] }],
    [['--body-file', 'f.md'], { bodyFile: ['f.md'] }],
    [['-F', 'f.md'], { bodyFile: ['f.md'] }],
    [['--body-file=f.md'], { bodyFile: ['f.md'] }],
    [['-F=f.md'], { bodyFile: ['f.md'] }],
    [['-Ff.md'], { bodyFile: ['f.md'] }],
    [
      ['--label', 'bug', '-l', 'plan', '--label=ops', '-lx'],
      { label: ['bug', 'plan', 'ops', 'x'] },
    ],
    [['--repo', 'o/r', '-R', 'p/q', '--repo=a/b', '-Rc/d'], { repo: ['o/r', 'p/q', 'a/b', 'c/d'] }],
    [['--title', 't', '-t', 'u', '--title=v', '-tw'], { title: ['t', 'u', 'v', 'w'] }],
    [['--draft', '--title', 't'], { draft: true, title: ['t'] }],
  ])('reads %j', (tokens, expected) => {
    expect(parseGhOptions(tokens)).toEqual({ ...EMPTY, ...expected })
  })

  it('does not take a missing value or stop-word as an option value', () => {
    expect(parseGhOptions(['--body'])).toEqual(EMPTY)
    expect(parseGhOptions(['--fill', '--unknown', 'x'])).toEqual(EMPTY)
  })

  it('stops at a command separator', () => {
    expect(parseGhOptions(['--title', 't', '&&', '--body', 'x'])).toEqual({
      ...EMPTY,
      title: ['t'],
    })
  })
})
