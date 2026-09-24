import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { HOST_STORAGE_MINIMUM_FREE_BYTES } from '../host-storage-preflight.mts'
import { initializeBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)

const testDirs: string[] = []

async function makeFakePnpm(): Promise<{ bin: string; countFile: string; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-deps-'))
  testDirs.push(root)
  const bin = join(root, 'bin')
  const countFile = join(root, 'pnpm-count')
  await mkdir(bin)

  const pnpmPath = join(bin, 'pnpm')
  await writeFile(
    pnpmPath,
    `#!/usr/bin/env bash
set -euo pipefail
count=0
if [ -f "$PNPM_COUNT_FILE" ]; then
  count=$(cat "$PNPM_COUNT_FILE")
fi
count=$((count + 1))
printf '%s' "$count" > "$PNPM_COUNT_FILE"
printf 'PNPM_ARGS=%s\\n' "$*"
if [ "$count" -le "$PNPM_FAIL_UNTIL_ATTEMPT" ]; then
  exit 1
fi
`,
  )
  await chmod(pnpmPath, 0o755)

  return { bin, countFile, root }
}

async function makeFailingNvm(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-nvm-'))
  testDirs.push(root)
  await writeFile(
    join(root, 'nvm.sh'),
    `nvm() {
  printf 'NVM_CALLED=%s\\n' "$*"
  return 3
}
`,
  )
  return root
}

async function runEnsureNodeVersion(env: NodeJS.ProcessEnv): Promise<{
  exitCode: number
  stderr: string
  stdout: string
}> {
  try {
    const result = await execFileAsync('bash', initializeBashArgs('ensure_node_version'), { env })

    return { exitCode: 0, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; stdout?: string }
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stderr: (e.stderr ?? '').trim(),
      stdout: (e.stdout ?? '').trim(),
    }
  }
}

async function runInstallDependencies(fake: {
  bin: string
  countFile: string
  root: string
  failUntilAttempt: number
  ci?: boolean
}): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const command = [
    'sleep() { :; }',
    // Mirror the conditional logic from dev/initialize: bare locally, --frozen-lockfile in CI.
    'lockfile_arg=""; [ -n "${CI:-}" ] && lockfile_arg="--frozen-lockfile"',
    'retry_command 3 5 "pnpm install${CI:+ --frozen-lockfile}" pnpm install ${lockfile_arg:+"$lockfile_arg"} --config.confirmModulesPurge=false',
  ].join('; ')

  const env: Record<string, string | undefined> = {
    ...process.env,
    HOME: fake.root,
    PATH: `${fake.bin}${delimiter}${process.env.PATH ?? ''}`,
    PNPM_COUNT_FILE: fake.countFile,
    PNPM_FAIL_UNTIL_ATTEMPT: String(fake.failUntilAttempt),
  }
  // Explicitly control CI regardless of the host environment.
  if (fake.ci === true) {
    env.CI = '1'
  } else if (fake.ci === false) {
    delete env.CI
  }

  try {
    const result = await execFileAsync('bash', initializeBashArgs(command), {
      cwd: fake.root,
      env,
    })

    return { exitCode: 0, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
  } catch (err: unknown) {
    const e = err as { code?: number; stderr?: string; stdout?: string }
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stderr: (e.stderr ?? '').trim(),
      stdout: (e.stdout ?? '').trim(),
    }
  }
}

describe('initialize dependency install', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('runs native addon readiness after dependency installation and before mise or success state', async () => {
    const source = await readFile(new URL('../initialize', import.meta.url), 'utf8')
    const install = source.indexOf(
      'retry_command 3 5 "pnpm install${CI:+ --frozen-lockfile} --config.confirmModulesPurge=false"',
    )
    const readiness = source.indexOf('native-addon-readiness.mts')
    const mise = source.indexOf('Installing pinned CI tools via mise')
    const marker = source.indexOf('persist_initialization_capability "$MODE"')
    const success = source.indexOf('✓ Worktree initialization complete!')

    expect(readiness).toBeGreaterThan(install)
    expect(readiness).toBeLessThan(mise)
    expect(readiness).toBeLessThan(marker)
    expect(readiness).toBeLessThan(success)
  })

  it('installs dependencies before loading the published worktree helper or allocating resources', async () => {
    const source = await readFile(new URL('../initialize', import.meta.url), 'utf8')
    const main = source.indexOf('main() {')
    const install = source.indexOf(
      'retry_command 3 5 "pnpm install${CI:+ --frozen-lockfile} --config.confirmModulesPurge=false"',
      main,
    )
    const loadHelper = source.indexOf('source "$REPO_ROOT/dev/lib/git-worktrees.sh"', main)
    const registerResources = source.indexOf(
      'register_live_worktree_resource_paths "$REPO_ROOT"',
      main,
    )

    expect(install).toBeGreaterThan(main)
    expect(loadHelper).toBeGreaterThan(install)
    expect(registerResources).toBeGreaterThan(loadHelper)
  })

  it('runs the bootstrap storage check before Node activation and the full preflight after it', async () => {
    const source = await readFile(new URL('../initialize', import.meta.url), 'utf8')
    const main = source.indexOf('main() {')
    const bootstrapPreflight = source.indexOf('check_bootstrap_host_storage', main)
    const activateNode = source.indexOf('    ensure_node_version', main)
    const storagePreflight = source.indexOf('host-storage-preflight.mts', main)

    expect(bootstrapPreflight).toBeGreaterThan(main)
    expect(activateNode).toBeGreaterThan(bootstrapPreflight)
    expect(activateNode).toBeGreaterThan(main)
    expect(storagePreflight).toBeGreaterThan(activateNode)
    expect(source).toContain(
      `HOST_STORAGE_MINIMUM_FREE_KIB=${HOST_STORAGE_MINIMUM_FREE_BYTES / 1024n}`,
    )
  })

  it('blocks Node installation when the bootstrap runtime reports low storage', async () => {
    const nvmDir = await makeFailingNvm()
    const command = [
      'df() { printf "Filesystem 1024-blocks Used Available Capacity Mounted on\\n"; printf "fake 10000000 5000000 5000000 50%% /\\n"; }',
      'check_bootstrap_host_storage && ensure_node_version',
    ].join('; ')
    let exitCode = 0
    let stdout = ''
    try {
      const result = await execFileAsync('bash', initializeBashArgs(command), {
        env: { ...process.env, NVM_DIR: nvmDir },
      })
      stdout = result.stdout
    } catch (err: unknown) {
      const error = err as { code?: number; stdout?: string }
      exitCode = typeof error.code === 'number' ? error.code : 1
      stdout = error.stdout ?? ''
    }

    expect(exitCode).toBe(1)
    expect(stdout).not.toContain('NVM_CALLED')
  })

  it('accepts exact 5 GiB equality in the bootstrap runtime', async () => {
    const availableKiB = HOST_STORAGE_MINIMUM_FREE_BYTES / 1024n
    const command = [
      `df() { printf "Filesystem 1024-blocks Used Available Capacity Mounted on\\n"; printf "fake 10000000 1 ${availableKiB} 1%% /\\n"; }`,
      'check_bootstrap_host_storage',
    ].join('; ')

    const result = await execFileAsync('bash', initializeBashArgs(command))

    expect(result.stderr).toBe('')
  })

  it('retries transient pnpm install failures', async () => {
    const fake = await makeFakePnpm()
    const result = await runInstallDependencies({ ...fake, failUntilAttempt: 2, ci: false })

    expect(result.exitCode).toBe(0)
    expect(await readFile(fake.countFile, 'utf8')).toBe('3')
    expect(result.stdout).toContain('attempt 1 failed for pnpm install')
    expect(result.stdout).toContain('attempt 2 failed for pnpm install')
  })

  it('returns the final pnpm install failure after retry exhaustion', async () => {
    const fake = await makeFakePnpm()
    const result = await runInstallDependencies({ ...fake, failUntilAttempt: 3, ci: false })

    expect(result.exitCode).toBe(1)
    expect(await readFile(fake.countFile, 'utf8')).toBe('3')
    expect(result.stdout).toContain('attempt 1 failed for pnpm install')
    expect(result.stdout).toContain('attempt 2 failed for pnpm install')
  })

  it('omits --frozen-lockfile when CI is not set (local worktree)', async () => {
    const fake = await makeFakePnpm()
    const result = await runInstallDependencies({ ...fake, failUntilAttempt: 0, ci: false })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('PNPM_ARGS=install --config.confirmModulesPurge=false')
    expect(result.stdout).not.toContain('--frozen-lockfile')
  })

  it('passes --frozen-lockfile when CI is set', async () => {
    const fake = await makeFakePnpm()
    const result = await runInstallDependencies({ ...fake, failUntilAttempt: 0, ci: true })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(
      'PNPM_ARGS=install --frozen-lockfile --config.confirmModulesPurge=false',
    )
  })

  it('skips nvm install when the caller already prepared Node on PATH', async () => {
    const nvmDir = await makeFailingNvm()
    const result = await runEnsureNodeVersion({
      ...process.env,
      NVM_DIR: nvmDir,
      SKIP_NVM_INSTALL: '1',
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('SKIP_NVM_INSTALL=1')
    expect(result.stdout).not.toContain('NVM_CALLED')
  })
})
