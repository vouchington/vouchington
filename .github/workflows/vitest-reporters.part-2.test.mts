import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatTeardownOverrunDiagnostics } from '../../test-helpers/vitest-teardown-overrun-diagnostics.mts'
import { createVitestTeardownOverrunReporter } from '../../test-helpers/vitest-teardown-overrun-reporter.mts'

// Companion file `vitest-reporters.test.mts` covers the reporter workflow wiring;
// this file covers only the teardown-overrun diagnostics and the reporter that emits them.
describe('Vitest CI reporters (part 2)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('formats teardown-overrun diagnostics with no failure vocabulary (#8259)', () => {
    const output = formatTeardownOverrunDiagnostics()

    expect(output).toContain('[vitest-teardown-overrun]')
    expect(output).toContain('process: pid=')
    expect(output).toContain('active resources:')
    expect(output).not.toMatch(/ FAIL |AssertionError|Test timed out|Unhandled Errors?/)
  })

  it('writes the teardown-overrun diagnostics to stderr when Vitest times out the process', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    createVitestTeardownOverrunReporter().onProcessTimeout?.()

    expect(write).toHaveBeenCalledOnce()
    expect(String(write.mock.calls[0]?.[0])).toContain('[vitest-teardown-overrun]')
  })
})
