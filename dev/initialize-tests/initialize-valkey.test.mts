import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs, runInitializeHelperStatus } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)

const testDirs: string[] = []

async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runHelper({ cwd, script, home }: { cwd: string; script: string; home?: string }) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: {
      ...process.env,
      HOME: home ?? dirname(cwd),
    },
  })

  return result.stdout.trim()
}

describe('initialize Valkey container helpers', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('leaves legacy Valkey containers for cleanup instead of deleting them automatically', async () => {
    const cwd = await makeWorktreeDir('.codex', 'worktrees', 'a7e6', 'voucha')

    const result = await runInitializeHelperStatus({
      cwd,
      script: `
    printf -v VALKEY_CONTAINER '%s' voucha-valkey-d0123456789ab
    LEGACY_VALKEY_CONTAINER=voucha-valkey-voucha
    VALKEY_PORT=51088

    docker() {
  case "$*" in
    "ps -a --format {{.Names}}")
      printf 'voucha-valkey-voucha\n'
      ;;
    "ps -a --filter publish=51088 --format {{.Names}}")
      printf 'voucha-valkey-voucha\n'
      ;;
    "rm -f voucha-valkey-voucha")
      touch .legacy-valkey-removed
      return 0
      ;;
    "run -d --name voucha-valkey-d0123456789ab -p 51088:6379 --restart unless-stopped valkey/valkey-bundle:9.1.0")
      return 0
      ;;
    "exec voucha-valkey-d0123456789ab valkey-cli ping")
      return 0
      ;;
    *)
      printf 'unexpected:%s\n' "$*" >> "$record"
      return 1
      ;;
  esac
    }

    ensure_valkey_container >/dev/null
    `,
    })

    expect(result.code).toBe(1)
    expect(existsSync(join(cwd, '.legacy-valkey-removed'))).toBe(false)
  })

  it('refuses to recreate the main Valkey container whenever its port mismatches', async () => {
    const cwd = await makeWorktreeDir('main-valkey-mismatch')

    const result = await runInitializeHelperStatus({
      cwd,
      script: `
    IS_MAIN=true
    VALKEY_CONTAINER=voucha-valkey
    VALKEY_PORT=50559

    docker() {
  case "$*" in
    "ps -a --format {{.Names}}")
      printf 'voucha-valkey\\n'
      ;;
    "inspect -f {{with (index .NetworkSettings.Ports \\"6379/tcp\\")}}{{with index . 0}}{{.HostPort}}{{end}}{{end}} voucha-valkey")
      printf '63309'
      ;;
    *)
      printf 'unexpected:%s\\n' "$*" >&2
      return 1
      ;;
  esac
    }

    ensure_valkey_container >/dev/null
    `,
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Refusing to recreate main Valkey container')
    expect(result.stderr).toContain('FORCE_MAIN_VALKEY_RECREATE=1')
  })

  it('recreates the main Valkey container on port mismatch when explicitly forced', async () => {
    const cwd = await makeWorktreeDir('main-valkey-mismatch-force')

    const output = await runHelper({
      cwd,
      script: `
    IS_MAIN=true
    FORCE_MAIN_VALKEY_RECREATE=1
    VALKEY_CONTAINER=voucha-valkey
    VALKEY_PORT=50559
    record=$(mktemp)

    docker() {
  case "$*" in
    "ps -a --format {{.Names}}")
      printf 'voucha-valkey\\n'
      ;;
    "inspect -f {{with (index .NetworkSettings.Ports \\"6379/tcp\\")}}{{with index . 0}}{{.HostPort}}{{end}}{{end}} voucha-valkey")
      printf '63309'
      ;;
    "ps -a --filter publish=50559 --format {{.Names}}")
      ;;
    "rm -f voucha-valkey")
      printf 'rm:%s\\n' "$3" >> "$record"
      ;;
    "run -d --name voucha-valkey -p 50559:6379 --restart unless-stopped valkey/valkey-bundle:9.1.0")
      printf 'run:%s\\n' "$4" >> "$record"
      ;;
    "exec voucha-valkey valkey-cli ping")
      return 0
      ;;
    *)
      printf 'unexpected:%s\\n' "$*" >> "$record"
      return 1
      ;;
  esac
    }

    ensure_valkey_container >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe('rm:voucha-valkey\nrun:voucha-valkey')
  })
})
