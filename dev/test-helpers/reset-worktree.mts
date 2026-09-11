import { strict as assert } from 'node:assert'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

export {
  cleanupResetWorktreeTestDirs,
  makeFakeBin,
  makeRepo,
  registerTestDir,
} from './reset-worktree-fixtures.mts'

const execFileAsync = promisify(execFile)

interface ResetWorktreeResult {
  exitCode: number
  log: string
  stderr: string
  stdout: string
}

async function readLog(cwd: string) {
  try {
    return await readFile(join(cwd, 'commands.log'), 'utf8')
  } catch {
    return ''
  }
}

export async function runResetWorktree({
  args = [],
  binDir,
  cwd,
  env = {},
}: {
  args?: string[]
  binDir: string
  cwd: string
  env?: Record<string, string | undefined>
}): Promise<ResetWorktreeResult> {
  const logPath = join(cwd, 'commands.log')
  try {
    const result = await execFileAsync('bash', [join(cwd, 'dev', 'reset-worktree'), ...args], {
      cwd,
      env: {
        ...process.env,
        ...env,
        FAKE_COMMAND_LOG: logPath,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    })
    return { exitCode: 0, log: await readLog(cwd), stderr: result.stderr, stdout: result.stdout }
  } catch (err: unknown) {
    const e = err as {
      code?: number
      signal?: NodeJS.Signals | null
      stderr?: string
      stdout?: string
    }
    if (typeof e.code !== 'number') {
      throw new Error(
        `reset-worktree exited via signal ${e.signal ?? 'unknown'} instead of a numeric exit code\n` +
          `stdout:\n${e.stdout ?? ''}\nstderr:\n${e.stderr ?? ''}\ncommand log:\n${await readLog(cwd)}`,
        { cause: err },
      )
    }
    return {
      exitCode: e.code,
      log: await readLog(cwd),
      stderr: (e.stderr ?? '').trim(),
      stdout: (e.stdout ?? '').trim(),
    }
  }
}

export function expectResetSuccess(result: ResetWorktreeResult) {
  assert.equal(
    result.exitCode,
    0,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}\ncommand log:\n${result.log}`,
  )
}
