import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs } from '../test-helpers/initialize.mts'

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

describe('initialize port assignment helpers', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('reuses saved ports for the current folder', async () => {
    const cwd = await makeWorktreeDir('feature-reuse')

    await writeFile(
      join(cwd, '.env'),
      `export PORT=3900
    export NEXT_PORT=3901
    export VALKEY_URL=redis://localhost:6388
    export WORKER_PORT=3902
    export IMAGE_LAMBDA_PORT=3903
    export INSPECTOR_PORT=3904
    export WEB_PUSH_PUBLIC_KEY=local-public
    export WEB_PUSH_PRIVATE_KEY=local-private
    export WEB_PUSH_SUBJECT=mailto:tests+local@voucha.ai
    `,
    )

    const output = await runHelper({
      cwd,
      script: `
    IS_MAIN=false
    WORKTREE_DIR=$(worktree_resource_current_dir "$PWD")
    SANITIZED_DIR=$(sanitize_worktree_dir "$WORKTREE_DIR")
    DB_NAME="voucha-${'${'}SANITIZED_DIR:0:53}"
    VALKEY_CONTAINER="voucha-valkey-${'${'}SANITIZED_DIR:0:45}"
    assign_worktree_ports >/dev/null
    printf '%s' "$BACKEND_PORT,$NEXT_PORT,$VALKEY_PORT,$WORKER_PORT,$IMAGE_LAMBDA_PORT,$DB_NAME,$VALKEY_CONTAINER"
    `,
    })

    expect(output).toBe('3900,3901,6388,3902,3903,voucha-feature-reuse,voucha-valkey-feature-reuse')
  })

  it('falls back to .valkey-port when VALKEY_URL is absent', async () => {
    const cwd = await makeWorktreeDir('feature-valkey-port')

    await writeFile(
      join(cwd, '.env'),
      `export PORT=4900
    export NEXT_PORT=4901
    export WORKER_PORT=4902
    export IMAGE_LAMBDA_PORT=4903
    export INSPECTOR_PORT=4904
    `,
    )
    await writeFile(join(cwd, '.valkey-port'), '6499\n')

    const output = await runHelper({
      cwd,
      script: `
    unset VALKEY_PORT VALKEY_URL
    IS_MAIN=false
    WORKTREE_DIR=$(worktree_dir_from_path "$PWD")
    SANITIZED_DIR=$(sanitize_worktree_dir "$WORKTREE_DIR")
    DB_NAME="voucha-${'${'}SANITIZED_DIR:0:53}"
    VALKEY_CONTAINER="voucha-valkey-${'${'}SANITIZED_DIR:0:45}"
    assign_worktree_ports >/dev/null
    printf '%s' "$VALKEY_PORT"
    `,
    })

    expect(output).toBe('6499')
  })

  it('derives codex-style worktree names from the path after /worktrees/', async () => {
    const cwd = await makeWorktreeDir('.codex', 'worktrees', 'a7e6', 'voucha')

    const output = await runHelper({
      cwd,
      script: `
    printf '%s' "$(worktree_dir_from_path "$PWD")"
    `,
    })

    expect(output).toBe('a7e6/voucha')
  })

  it('reuses STORYBOOK_PORT from .env when present', async () => {
    const cwd = await makeWorktreeDir('feature-storybook-port-reuse')

    await writeFile(
      join(cwd, '.env'),
      `export PORT=3900
    export NEXT_PORT=3901
    export VALKEY_URL=redis://localhost:6388
    export WORKER_PORT=3902
    export IMAGE_LAMBDA_PORT=3903
    export INSPECTOR_PORT=3904
    export STORYBOOK_PORT=3905
    `,
    )

    const output = await runHelper({
      cwd,
      script: `
    IS_MAIN=false
    WORKTREE_DIR=$(worktree_dir_from_path "$PWD")
    SANITIZED_DIR=$(sanitize_worktree_dir "$WORKTREE_DIR")
    DB_NAME="voucha-${'${'}SANITIZED_DIR:0:53}"
    VALKEY_CONTAINER="voucha-valkey-${'${'}SANITIZED_DIR:0:45}"
    assign_worktree_ports >/dev/null
    printf '%s' "$STORYBOOK_PORT"
    `,
    })

    expect(output).toBe('3905')
  })

  it('allocates a fresh STORYBOOK_PORT when absent from .env', async () => {
    const cwd = await makeWorktreeDir('feature-storybook-port-alloc')

    await writeFile(
      join(cwd, '.env'),
      `export PORT=3900
    export NEXT_PORT=3901
    export VALKEY_URL=redis://localhost:6388
    export WORKER_PORT=3902
    export IMAGE_LAMBDA_PORT=3903
    export INSPECTOR_PORT=3904
    `,
    )

    const output = await runHelper({
      cwd,
      script: `
    IS_MAIN=false
    WORKTREE_DIR=$(worktree_dir_from_path "$PWD")
    SANITIZED_DIR=$(sanitize_worktree_dir "$WORKTREE_DIR")
    DB_NAME="voucha-${'${'}SANITIZED_DIR:0:53}"
    VALKEY_CONTAINER="voucha-valkey-${'${'}SANITIZED_DIR:0:45}"
    assign_worktree_ports >/dev/null
    printf '%s' "$STORYBOOK_PORT"
    `,
    })

    expect(Number(output)).toBeGreaterThanOrEqual(1024)
    expect(Number(output)).toBeLessThanOrEqual(65535)
  })

  it('allocates STORYBOOK_PORT distinct from all other assigned ports', async () => {
    const cwd = await makeWorktreeDir('feature-storybook-port-distinct')

    const output = await runHelper({
      cwd,
      script: `
    IS_MAIN=false
    WORKTREE_DIR=$(worktree_dir_from_path "$PWD")
    SANITIZED_DIR=$(sanitize_worktree_dir "$WORKTREE_DIR")
    DB_NAME="voucha-${'${'}SANITIZED_DIR:0:53}"
    VALKEY_CONTAINER="voucha-valkey-${'${'}SANITIZED_DIR:0:45}"
    assign_worktree_ports >/dev/null
    printf '%s' "$BACKEND_PORT,$NEXT_PORT,$VALKEY_PORT,$WORKER_PORT,$IMAGE_LAMBDA_PORT,$INSPECTOR_PORT,$STORYBOOK_PORT"
    `,
    })

    const ports = output.split(',')
    const storybookPort = ports[6]
    const otherPorts = ports.slice(0, 6)
    expect(otherPorts).not.toContain(storybookPort)
  })

  it('rejects WORKER_PORT=8787 in non-main worktree and reallocates', async () => {
    const cwd = await makeWorktreeDir('feature-stale-worker-port')

    await writeFile(
      join(cwd, '.env'),
      `export PORT=3900
    export NEXT_PORT=3901
    export VALKEY_URL=redis://localhost:6388
    export WORKER_PORT=8787
    export IMAGE_LAMBDA_PORT=3903
    export INSPECTOR_PORT=3904
    `,
    )

    const output = await runHelper({
      cwd,
      script: `
    IS_MAIN=false
    WORKTREE_DIR=$(worktree_dir_from_path "$PWD")
    SANITIZED_DIR=$(sanitize_worktree_dir "$WORKTREE_DIR")
    DB_NAME="voucha-${'${'}SANITIZED_DIR:0:53}"
    VALKEY_CONTAINER="voucha-valkey-${'${'}SANITIZED_DIR:0:45}"
    assign_worktree_ports >/dev/null
    printf '%s' "$WORKER_PORT"
    `,
    })

    expect(output).not.toBe('8787')
    expect(Number(output)).toBeGreaterThanOrEqual(1024)
    expect(Number(output)).toBeLessThanOrEqual(65535)
  })

  it("discards stale ports when WORKTREE_DIR doesn't match", async () => {
    const cwd = await makeWorktreeDir('feature-stale-worktree-dir')

    await writeFile(
      join(cwd, '.env'),
      `export PORT=3900
    export NEXT_PORT=3901
    export VALKEY_URL=redis://localhost:6388
    export WORKER_PORT=3902
    export IMAGE_LAMBDA_PORT=3903
    export INSPECTOR_PORT=3904
    export WORKTREE_DIR=some-other-worktree
    `,
    )

    const output = await runHelper({
      cwd,
      script: `
    IS_MAIN=false
    WORKTREE_DIR=$(worktree_resource_current_dir "$PWD")
    SANITIZED_DIR=$(sanitize_worktree_dir "$WORKTREE_DIR")
    DB_NAME="voucha-${'${'}SANITIZED_DIR:0:53}"
    VALKEY_CONTAINER="voucha-valkey-${'${'}SANITIZED_DIR:0:45}"
    assign_worktree_ports
    printf '\nports=%s' "$BACKEND_PORT,$NEXT_PORT,$VALKEY_PORT,$WORKER_PORT,$IMAGE_LAMBDA_PORT"
    `,
    })

    expect(output).toContain('./dev/cleanup removes orphaned hashed resources')
    const ports = output.match(/ports=(.*)$/)?.[1].split(',') ?? []
    expect(ports).toHaveLength(5)
    expect(ports).not.toContain('3900')
    expect(ports).not.toContain('3901')
    expect(ports).not.toContain('6388')
    expect(ports).not.toContain('3902')
    expect(ports).not.toContain('3903')
    for (const p of ports) {
      expect(Number(p)).toBeGreaterThanOrEqual(1024)
      expect(Number(p)).toBeLessThanOrEqual(65535)
    }
  })
})
