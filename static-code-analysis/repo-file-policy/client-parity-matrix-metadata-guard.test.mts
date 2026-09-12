import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkClientParityMatrixGuard } from './client-parity-matrix-guard.mts'

const matrixFile = 'docs/requirements/CLIENT-PARITY-MATRIX.md'
const roots: string[] = []

function run(lines: string[]): string[] {
  const root = mkdtempSync(join(tmpdir(), 'voucha-matrix-metadata-'))
  roots.push(root)
  mkdirSync(join(root, 'docs/requirements'), { recursive: true })
  writeFileSync(
    join(root, matrixFile),
    [
      '| Capability | Web | Swift | .NET | Notes |',
      '| --- | --- | --- | --- | --- |',
      '| Baseline | 🟢 | 🟢 | 🟢 | Baseline. |',
      '',
      ...lines,
    ].join('\n'),
  )
  const errors: string[] = []
  checkClientParityMatrixGuard(root, [matrixFile], errors)
  return errors
}

describe('client parity matrix metadata guard', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
  })

  it('rejects non-canonical, mismatched, and duplicate issue definitions', () => {
    const errors = run([
      '[#1111] reference',
      '[#1111]: https://github.com/other/repository/issues/2222',
      '[#1111]: https://github.com/vouchington/vouchington/issues/1111',
    ])
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must target vouchington/vouchington'),
        expect.stringContaining('URL targets issue #2222'),
        expect.stringContaining('duplicate issue definition [#1111]'),
      ]),
    )
  })

  it('rejects HTTP issue definitions', () => {
    expect(
      run(['[#1111] reference', '[#1111]: http://github.com/vouchington/vouchington/issues/1111']),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('issue definition [#1111] must use canonical HTTPS'),
      ]),
    )
  })

  it('rejects unused issue definitions', () => {
    expect(run(['[#4444]: https://github.com/vouchington/vouchington/issues/4444'])).toEqual(
      expect.arrayContaining([expect.stringContaining('issue definition [#4444] is unused')]),
    )
  })

  it('rejects references without definitions', () => {
    expect(run(['[#1111] reference'])).toEqual(
      expect.arrayContaining([
        expect.stringContaining('issue reference [#1111] is used but missing a footer definition'),
      ]),
    )
  })

  it('rejects blank and unknown summary statuses', () => {
    const errors = run([
      '| Capability | Web | Swift | .NET | Notes |',
      '| --- | --- | --- | --- | --- |',
      '| Messaging | 🟢 | | unknown | Invalid statuses. |',
    ])
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('summary row contains a blank or unknown client status'),
      ]),
    )
  })

  it('rejects closed history and non-shared clients in Table C', () => {
    const errors = run([
      '| # | Capability / Domain | Feature ID | Client(s) | Current state | Phase | Issue |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| 1 | Messages | messages | Swift | Closed by native parity | 1 | [#1111] |',
      '[#1111]: https://github.com/vouchington/vouchington/issues/1111',
    ])
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Table C must contain active gaps only'),
        expect.stringContaining('Client(s) must be exactly "Swift + .NET"'),
      ]),
    )
  })

  it('rejects blank and unknown active-gap current states instead of inferring partial', () => {
    const errors = run([
      '| # | Capability / Domain | Feature ID | Client(s) | Current state | Phase | Issue |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| 1 | Messages | messages | Swift + .NET | | 1 | [#1111] |',
      '| 2 | Search | search | Swift + .NET | Native support remains incomplete | 1 | [#2222] |',
      '[#1111]: https://github.com/vouchington/vouchington/issues/1111',
      '[#2222]: https://github.com/vouchington/vouchington/issues/2222',
    ])
    expect(
      errors.filter(error => error.includes('active gap Current state must begin')),
    ).toHaveLength(2)
  })
})
