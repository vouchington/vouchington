import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const script = fileURLToPath(new URL('../retrospective-facts', import.meta.url))

describe('retrospective-facts adapter', () => {
  it('loads through the documented executable and retains local help', async () => {
    const result = await run(script, ['--help'])

    expect(result.stdout).toContain('Usage: ./dev/retrospective-facts')
    expect(result.stderr).toBe('')
  })
})
