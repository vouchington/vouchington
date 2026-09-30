import { describe, expect, it } from 'vitest'

import { BASELINE_PATH, UPDATE_COMMAND } from './config.mts'
import {
  errorMessage,
  formatDiffFailure,
  formatOk,
  formatTestFilesRemoved,
  formatUpdated,
} from './messages.mts'
import type { Finding } from './report.mts'

const exportOf = (file: string, symbol: string): Finding => ({ file, symbol, type: 'exports' })

describe('formatDiffFailure', () => {
  it('explains new findings, how to fix them, and the exact update command', () => {
    const message = formatDiffFailure({
      added: [
        exportOf('backend/a.mts', 'one'),
        exportOf('backend/a.mts', 'two'),
        { file: 'backend/a.mts', symbol: 'Shape', type: 'types' },
      ],
      removed: [],
    })
    expect(message).toContain('New findings (3)')
    expect(message).toContain('  backend/a.mts\n    exports: one, two\n    types: Shape')
    expect(message).toContain('Delete the export')
    expect(message).toContain('module-private')
    expect(message).toContain('test-helpers')
    expect(message).toContain('@public')
    expect(message).toContain(
      `Only regenerate the baseline for a reviewed exception: ${UPDATE_COMMAND}`,
    )
    expect(message).not.toContain('Stale baseline entries')
  })

  it('tells a stale baseline to shrink without fix advice', () => {
    const message = formatDiffFailure({ added: [], removed: [exportOf('backend/b.mts', 'gone')] })
    expect(message).toContain('Stale baseline entries (1)')
    expect(message).toContain('backend/b.mts')
    expect(message).toContain(`Regenerate the baseline: ${UPDATE_COMMAND}`)
    expect(message).not.toContain('New findings')
    expect(message).not.toContain('Delete the export')
  })

  it('reports both directions at once and names the baseline file', () => {
    const message = formatDiffFailure({
      added: [exportOf('backend/a.mts', 'one')],
      removed: [exportOf('backend/b.mts', 'gone')],
    })
    expect(message).toContain(BASELINE_PATH)
    expect(message).toContain('New findings (1)')
    expect(message).toContain('Stale baseline entries (1)')
  })

  it('caps the files it lists', () => {
    const added = Array.from({ length: 45 }, (_, index) => exportOf(`backend/f${index}.mts`, 'x'))
    const message = formatDiffFailure({ added, removed: [] })
    expect(message).toContain('New findings (45)')
    expect(message).toContain('...and 5 more files')
  })
})

describe('status lines', () => {
  it('states the counts and the baseline path', () => {
    expect(formatOk(7)).toContain('7 known findings')
    expect(formatUpdated(7, 3)).toContain('7 findings in 3 files')
    expect(formatTestFilesRemoved(12)).toContain('temporarily removed 12 tracked test files')
  })

  it('formats thrown values', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
  })
})
