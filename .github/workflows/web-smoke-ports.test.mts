import { execFile as execFileCallback } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const smokeScript = resolve('web/scripts/tests/smoke-test-web.sh')
const smokeScriptSource = readFileSync(smokeScript, 'utf8')

interface SmokeRun {
  allocatorArgs: string[]
  allocatorPath: string
  code: number
  output: string
}

// Runs a copy of the real script inside a throwaway repo layout (`web/scripts/tests/` under a
// root that has no `web/.next`), so a run that gets past port validation stops at the build check
// instead of starting a server. `python3` is a stand-in that records how it was called and prints
// the supplied allocator output, so no port is bound and the result is deterministic.
async function runSmoke(allocatorOutput: string, allocatorExit = 0): Promise<SmokeRun> {
  const root = await mkdtemp(join(tmpdir(), 'voucha-web-smoke-ports-'))
  try {
    const scriptDir = join(root, 'web/scripts/tests')
    const bin = join(root, 'bin')
    const argsFile = join(root, 'allocator-args')
    await mkdir(scriptDir, { recursive: true })
    await mkdir(bin)
    await copyFile(smokeScript, join(scriptDir, 'smoke-test-web.sh'))
    await writeFile(
      join(bin, 'python3'),
      `#!/bin/bash\nprintf '%s\\n' "$@" > "$ARGS_FILE"\nprintf '%s' "$ALLOCATOR_OUTPUT"\nexit "$ALLOCATOR_EXIT"\n`,
    )
    await chmod(join(bin, 'python3'), 0o755)

    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      ARGS_FILE: argsFile,
      ALLOCATOR_OUTPUT: allocatorOutput,
      ALLOCATOR_EXIT: String(allocatorExit),
    }
    let code = 0
    let output = ''
    try {
      // Start from an unrelated directory: the allocator path must not depend on the cwd.
      const result = await execFile('bash', [join(scriptDir, 'smoke-test-web.sh')], {
        cwd: bin,
        env,
        timeout: 15_000,
      })
      output = result.stdout + result.stderr
    } catch (error) {
      const failure = error as { code: number; stdout: string; stderr: string }
      code = failure.code
      output = failure.stdout + failure.stderr
    }
    const [allocatorPath, ...allocatorArgs] = (await readFile(argsFile, 'utf8')).trim().split('\n')
    return { allocatorArgs, allocatorPath, code, output }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('Web smoke port allocation', () => {
  it('reserves both ports from the browser-safe allocator, not from RANDOM', () => {
    expect(smokeScriptSource).not.toMatch(/\bRANDOM\b/)
    expect(
      existsSync(join(dirname(smokeScript), '../../../ci/allocate-browser-safe-ports.py')),
    ).toBe(true)
  })

  it('asks the repo-root allocator for two ports and accepts two distinct ones', async () => {
    const run = await runSmoke('43001 43002')

    // Validation passed: the script moved on to the build check, which the fixture lacks.
    expect(run.output).toContain('Next.js build not found')
    expect(run.code).toBe(1)
    expect(run.allocatorArgs).toEqual(['2'])
    expect(run.allocatorPath).toMatch(
      /voucha-web-smoke-ports-[^/]+\/ci\/allocate-browser-safe-ports\.py$/,
    )
  })

  it.each([
    ['nothing', ''],
    ['only one port', '43001'],
    ['the same port twice', '43001 43001'],
  ])('fails before starting anything when the allocator returns %s', async (_name, output) => {
    const run = await runSmoke(output)

    expect(run.code).not.toBe(0)
    expect(run.output).toContain('browser-safe ports')
    expect(run.output).not.toContain('Next.js build not found')
  })

  it('fails with a clear message when the allocator itself fails', async () => {
    const run = await runSmoke('', 1)

    expect(run.code).not.toBe(0)
    expect(run.output).toContain('Could not allocate browser-safe ports')
  })
})
