import { describe, expect, it } from 'vitest'

import { parseClientParityMatrix } from './client-parity-matrix-parser.mts'

function makeMatrixDoc(tableARow: string, tableCRow: string): string {
  return [
    '# Client Parity Matrix',
    '',
    '| Capability | Web | Swift | .NET | Notes |',
    '| ---------- | --- | ----- | ---- | ----- |',
    tableARow,
    '',
    '| # | Capability / Domain | Feature ID | Client(s) | Current state | Phase | Issue |',
    '| - | ------------------- | ---------- | --------- | ------------- | ----- | ----- |',
    tableCRow,
  ].join('\n')
}

describe('parseClientParityMatrix', () => {
  it('returns table identity, per-client statuses, and Table C tracking issues', () => {
    const { rows } = parseClientParityMatrix(
      makeMatrixDoc(
        '| Messaging | 🟢 | 🟡 (partial) | 🔴 (none) | Native compose is incomplete. |',
        '| 1 | Messages | messages | Swift + .NET | Partial: native compose remains missing | 1 | [#1111] |',
      ),
    )

    expect(rows).toEqual([
      expect.objectContaining({
        tableKind: 'A',
        webStatus: 'full',
        swiftStatus: 'partial',
        dotnetStatus: 'none',
        trackingIssueIds: new Set(),
      }),
      expect.objectContaining({
        tableKind: 'C',
        trackingIssueIds: new Set(['1111']),
      }),
    ])
  })

  it('accepts optional trailing pipes and skips malformed table rows', () => {
    const { rows } = parseClientParityMatrix(
      [
        '# Client Parity Matrix',
        '',
        '| Capability | Web | Swift | .NET | Notes',
        '| ---------- | --- | ----- | ---- | -----',
        '| Messaging | 🟢 | 🟢 | 🟢 | Native compose is built.',
        '| Extra | 🟢 | 🟢 | 🟢 | Native compose is built. | ignored |',
        'Broken | 🟢 |',
        '',
        '| # | Capability / Domain | Feature ID | Client(s) | Current state | Phase | Issue',
        '| - | ------------------- | ---------- | --------- | ------------- | ----- | -----',
        '| 1 | Messages | messages | Swift + .NET | Closed by native compose parity | 1 | [#1111]',
        '| 2 | Extra Messages | extra-messages | Swift + .NET | Closed by native compose parity | 1 | [#2222] | ignored |',
      ].join('\n'),
    )

    expect(rows.map(row => row.surfaceKey)).toEqual(['messaging', 'messages'])
  })

  it('keeps Table C arrow follow-ups out of closed-by issue IDs', () => {
    const { rows } = parseClientParityMatrix(
      makeMatrixDoc(
        '| Messaging | 🟢 | 🟢 | 🟢 | Native compose is built. |',
        '| 1 | Pickers | pickers | Swift + .NET | Closed by native picker shell; advanced picker still missing (→ [#9999]) | 2 | [#6666] |',
      ),
    )

    const tableCRow = rows.find(row => row.surfaceKey === 'pickers')
    expect(tableCRow).toBeDefined()
    expect([...tableCRow!.closedByIssueIds]).toEqual(['6666'])
    expect([...tableCRow!.openArrowIssueIds]).toEqual(['9999'])
  })

  it('captures coordinated closed-by issue lists', () => {
    const { rows } = parseClientParityMatrix(
      makeMatrixDoc(
        '| Analytics | 🟢 | 🟢 | 🟢 | Native analytics are built (closed by [#7777] and [#8888]). |',
        '| 1 | Messages | messages | Swift + .NET | Closed by native compose parity | 1 | [#1111] |',
      ),
    )

    const tableARow = rows.find(row => row.surfaceKey === 'analytics')
    expect(tableARow).toBeDefined()
    expect([...tableARow!.closedByIssueIds]).toEqual(['7777', '8888'])
  })

  it('classifies no pending state as a residual Table C gap', () => {
    const { rows } = parseClientParityMatrix(
      makeMatrixDoc(
        '| Social | 🟢 | 🟡 (partial) | 🟡 (partial) | Native follow exists. |',
        '| 1 | Social | social | Swift + .NET | Closed by native follow; no pending state | 2 | [#2222] |',
      ),
    )

    expect(rows.find(row => row.surfaceKey === 'social')?.statusKind).toBe('partial')
  })

  it('uses an explicit Table C status before residual prose', () => {
    const { rows } = parseClientParityMatrix(
      makeMatrixDoc(
        '| Billing | 🟢 | 🟡 (present) | 🟡 (present) | Store management is absent. |',
        '| 1 | Billing | billing | Swift + .NET | Present: plan status renders, but store management remains absent | 3 | [#2222] |',
      ),
    )
    expect(rows.find(row => row.surfaceKey === 'billing')?.statusKind).toBe('present')
  })

  it('parses read, plumb, and present as distinct client statuses', () => {
    const { rows } = parseClientParityMatrix(
      makeMatrixDoc(
        '| Delivery | 🟡 (read) | 🟡 (plumb) | 🟡 (present) | Distinct states. |',
        '| 1 | Delivery | delivery | Swift + .NET | Partial: delivery remains incomplete | 2 | [#2222] |',
      ),
    )
    expect(rows[0]).toEqual(
      expect.objectContaining({
        webStatus: 'read',
        swiftStatus: 'plumb',
        dotnetStatus: 'present',
      }),
    )
  })

  it('preserves the issue-definition protocol for canonical URL validation', () => {
    const { definitions } = parseClientParityMatrix(
      [
        '[#1111] and [#2222]',
        '[#1111]: https://github.com/jonathanong/filaments/issues/1111',
        '[#2222]: http://github.com/jonathanong/filaments/issues/2222',
      ].join('\n'),
    )
    expect(definitions).toEqual([
      expect.objectContaining({ issueId: '1111', protocol: 'https' }),
      expect.objectContaining({ issueId: '2222', protocol: 'http' }),
    ])
  })
})
