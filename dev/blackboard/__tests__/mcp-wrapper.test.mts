import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const wrapperPath = fileURLToPath(new URL('../../blackboard-mcp', import.meta.url))
const testDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'blackboard-mcp-'))
  testDirs.push(dir)
  return dir
}

describe('dev/blackboard-mcp', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('resolves the root-installed MCP server outside the repository cwd and handles EOF', async () => {
    const result = await execFileAsync('bash', ['-c', 'exec "$1" </dev/null', '--', wrapperPath], {
      cwd: await makeTempDir(),
      env: {
        ...process.env,
        AGENT_BLACKBOARD_URL: 'https://example.invalid/',
        AGENT_BLACKBOARD_TOKEN: 'test-token',
      },
    })

    expect(result).toEqual({ stdout: '', stderr: '' })
  })
})
