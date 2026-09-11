import { describe, expect, it } from 'vitest'

import {
  formatCheckIndexRenamesResult,
  type CheckIndexRenamesResult,
} from './check-index-renames-result.mts'
import { RETIRED_INDEX_ALLOWLIST_FILE } from './retired-index-allowlist.mts'

const RENAMED_INDEX = 'idx_widgets__name'
const RENAMED_TO = 'idx_widgets__name_v2'

describe('formatCheckIndexRenamesResult', () => {
  it('formats a skipped result as a passing notice', () => {
    const result: CheckIndexRenamesResult = { status: 'skipped', reason: 'no snapshot at base' }
    expect(formatCheckIndexRenamesResult(result)).toEqual({
      exitCode: 0,
      lines: ['::notice::check-index-renames: no snapshot at base; nothing to compare.'],
    })
  })

  it('formats a clean result as a single passing line', () => {
    const result: CheckIndexRenamesResult = { status: 'clean' }
    expect(formatCheckIndexRenamesResult(result)).toEqual({
      exitCode: 0,
      lines: ['No unacknowledged PostgreSQL index renames.'],
    })
  })

  it('formats unacknowledged renames and stale allowlist entries as failing ::error:: lines', () => {
    const result: CheckIndexRenamesResult = {
      status: 'unacknowledged',
      unacknowledged: [
        {
          table: 'widgets',
          retiredName: RENAMED_INDEX,
          retiredDefinition: '',
          renamedTo: RENAMED_TO,
        },
      ],
      staleAllowlistEntries: ['idx_stale'],
    }
    const formatted = formatCheckIndexRenamesResult(result)
    expect(formatted.exitCode).toBe(1)
    expect(formatted.lines).toHaveLength(2)
    expect(formatted.lines[0]).toContain(`widgets.${RENAMED_INDEX} was renamed to ${RENAMED_TO}`)
    expect(formatted.lines[0]).toContain(RETIRED_INDEX_ALLOWLIST_FILE)
    expect(formatted.lines[1]).toBe(
      `::error::stale retired-index allowlist entry in ${RETIRED_INDEX_ALLOWLIST_FILE}: idx_stale ` +
        `— no detected rename matches it anymore (possibly resolved by another already-merged ` +
        `change, not necessarily this branch). Remove this entry.`,
    )
  })
})
