import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = join(process.cwd(), 'ci/run-bounded.py')

describe('run-bounded merged output ordering', () => {
  it.each(['pipe', 'socket', 'regular', 'independent-files'])(
    'preserves sequential writes and open descriptions for %s',
    mode => {
      const result = spawnSync(
        'python3',
        ['ci/test-helpers/run-bounded-merged-output.py', script, mode],
        {
          encoding: 'utf8',
          timeout: 7000,
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toEqual({
        status: 3,
        length: 1048577,
        marker: 1048576,
        allBytes: true,
        positions: mode === 'independent-files' ? [1048576, 1048577] : null,
      })
    },
  )
})
