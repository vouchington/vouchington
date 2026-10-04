import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { checkBoundedWorkTunables } from './bounded-work-tunables.mts'

vi.mock(import('node:child_process'), { spy: true })
const scanner = vi.mocked(spawnSync)

const file = 'backend/api/runtime-pagination.mts'
const result = { pid: 1, signal: null, output: [], status: 0, stdout: '', stderr: '' }

describe('bounded work scanner failures', () => {
  it.each([
    { ...result, error: new Error('Scanner unavailable') },
    { ...result, status: 8, stderr: 'Invalid rule' },
    { ...result, status: 1 },
    { ...result, stdout: 'not-json' },
    { ...result, stdout: '{}' },
  ])('fails closed on scanner execution or malformed diagnostics', output => {
    scanner.mockReturnValue(output)
    expect(checkBoundedWorkTunables(process.cwd(), [file], [])).toEqual([
      expect.stringContaining('bounded work tunables scanner failed'),
    ])
  })

  it('rejects diagnostics escaping the tracked repository scope', () => {
    scanner.mockReturnValue({
      ...result,
      stdout: JSON.stringify({
        file: '../outside.mts',
        ruleId: 'bounded-work-literal',
        range: { start: { line: 0 } },
        metaVariables: { single: { NAME: { text: 'BATCH_SIZE' }, VALUE: { text: '100' } } },
      }),
    })
    expect(
      checkBoundedWorkTunables(
        process.cwd(),
        [file],
        [
          {
            file,
            ruleId: 'bounded-work-literal',
            identifier: 'BATCH_SIZE',
            value: '100',
            reason: 'Protocol',
          },
        ],
      )[0],
    ).toContain('escaped repository')
  })
})
