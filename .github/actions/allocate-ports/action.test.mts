import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const action = readFileSync('.github/actions/allocate-ports/action.yml', 'utf8')

describe('allocate-ports composite action', () => {
  it('delegates to the shared Fetch-safe port allocator', () => {
    expect(action).toContain('ci/allocate-browser-safe-ports.py "$PORT_COUNT"')
    expect(action).toContain('lsof -ti:"$p"')
    expect(action).toContain('deterministic allocation will not retry')
    expect(action).not.toContain('while [ "$ATTEMPT" -lt 10 ]')
    expect(action).not.toContain('re-randomizing')
    expect(action).not.toContain('socket.socket() for _ in range(n)')
    expect(action.indexOf('BROWSER_ALLOCATED_PORTS=$PORTS')).toBeLessThan(
      action.indexOf('for p in $PORTS'),
    )
  })
})
