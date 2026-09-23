import { execFile as execFileCallback } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const scriptPath = resolve('ci/allocate-browser-safe-ports.py')

function parsePorts(stdout: string): number[] {
  return stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(port => Number.parseInt(port, 10))
}

describe('allocate-browser-safe-ports.py', () => {
  it('allocates the requested number of unique ports', async () => {
    const { stdout } = await execFile('python3', [scriptPath, '6'], {
      cwd: process.cwd(),
      env: { ...process.env, GITHUB_ACTIONS: '' },
    })
    const ports = parsePorts(stdout)

    expect(ports).toHaveLength(6)
    expect(new Set(ports).size).toBe(6)
    for (const port of ports) {
      expect(Number.isInteger(port)).toBe(true)
      expect(port).toBeGreaterThan(0)
    }
  })
})
