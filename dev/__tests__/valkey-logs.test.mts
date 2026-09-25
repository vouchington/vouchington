import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runProcess } from '../test-helpers/run-process.mts'

const valkeyLogsPath = fileURLToPath(new URL('../valkey-logs', import.meta.url))

type ScriptRun = {
  stdout: string
  stderr: string
  code: number | null
  timedOut: boolean
}

// Static across every test (no per-workspace interpolation), so both fakes can be
// written once and shared instead of rewritten per test.
const DOCKER_FAKE = [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  'for name in DATABASE_URL S3_AWS_SECRET_ACCESS_KEY BEDROCK_AWS_SECRET_ACCESS_KEY; do',
  '  if [ -n "${!name:-}" ]; then',
  '    printf "%s leaked to docker\\n" "$name" >&2',
  '    exit 2',
  '  fi',
  'done',
  'if [ "${1:-}" != exec ] || [ "${2:-}" != voucha-test-valkey ] || [ "${3:-}" != valkey-cli ]; then',
  '  printf "unexpected docker invocation: %s\\n" "$*" >&2',
  '  exit 2',
  'fi',
  'case "${4:-}" in',
  '  PING) printf PONG ;;',
  "  MONITOR) printf '+OK monitor started\\n'; sleep 1 ;;",
  '  *) printf "unexpected valkey command: %s\\n" "${4:-}" >&2; exit 2 ;;',
  'esac',
  '',
].join('\n')

const TAIL_FAKE = [
  '#!/usr/bin/env bash',
  'set -euo pipefail',
  'if [ "${1:-}" != -f ] || [ -z "${2:-}" ]; then',
  '  printf "unexpected tail invocation: %s\\n" "$*" >&2',
  '  exit 2',
  'fi',
  'cat "$2"',
  '',
].join('\n')

let binRoot: string
let binDir: string
let dockerPath: string
let tailPath: string

async function createFakeWorkspace(databaseUrl?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-valkey-logs-'))
  const envLines = ['echo noisy env output', 'export VALKEY_CONTAINER=voucha-test-valkey']
  if (databaseUrl !== undefined) {
    envLines.push(`export DATABASE_URL=${databaseUrl}`)
  }
  await writeFile(join(dir, '.env'), [...envLines, ''].join('\n'))

  return dir
}

async function runUntilStartupBanner(scriptPath: string, cwd: string): Promise<ScriptRun> {
  const result = await runProcess(scriptPath, [], {
    cwd,
    env: {
      ...process.env,
      BEDROCK_AWS_SECRET_ACCESS_KEY: 'parent-bedrock-secret',
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      S3_AWS_SECRET_ACCESS_KEY: 'parent-s3-secret',
      TMPDIR: cwd,
    },
    timeoutMs: 5000,
  })
  return {
    code: result.code,
    stderr: result.stderr,
    stdout: result.stdout,
    timedOut: result.timedOut,
  }
}

describe('dev Valkey log commands', () => {
  beforeAll(async () => {
    binRoot = await mkdtemp(join(tmpdir(), 'voucha-valkey-logs-bin-'))
    binDir = join(binRoot, 'bin')
    await mkdir(binDir)
    dockerPath = join(binDir, 'docker')
    tailPath = join(binDir, 'tail')

    await writeFile(dockerPath, DOCKER_FAKE)
    await chmod(dockerPath, 0o755)
    await writeFile(tailPath, TAIL_FAKE)
    await chmod(tailPath, 0o755)

    // Warm the freshly-written executables once: a brand-new file pays a one-time
    // first-exec cost on macOS that the timed tests below can't reliably absorb
    // (suspected cause of the #473 flake). The invocation args only need to exercise
    // the fake's own script/interpreter path, not succeed.
    await Promise.all([
      runProcess(dockerPath, [], { timeoutMs: 2000 }),
      runProcess(tailPath, ['-f', join(binRoot, 'warm-missing-file')], { timeoutMs: 2000 }),
    ])
  })

  afterAll(async () => {
    await rm(binRoot, { force: true, recursive: true })
  })

  it('starts the Valkey monitor without printing database credentials', async () => {
    const dir = await createFakeWorkspace(
      'postgres://dev:super-secret-password@dbhost:15432/voucha-test',
    )
    try {
      const output = await runUntilStartupBanner(valkeyLogsPath, dir)

      expect(output.timedOut).toBe(false)
      expect(output.code).toBe(0)
      expect(output.stdout).toContain('Tailing Valkey commands (container: voucha-test-valkey)')
      expect(output.stdout).toContain('Source: valkey-cli MONITOR')
      expect(output.stdout).not.toContain('DATABASE_URL')
      expect(output.stdout).not.toContain('super-secret-password')
      expect(output.stdout).not.toContain('dbhost')
      expect(output.stderr).not.toContain('DATABASE_URL')
      expect(output.stderr).not.toContain('super-secret-password')
      expect(output.stderr).not.toContain('dbhost')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('starts the Valkey monitor without requiring DATABASE_URL', async () => {
    const dir = await createFakeWorkspace()
    try {
      const output = await runUntilStartupBanner(valkeyLogsPath, dir)

      expect(output.timedOut).toBe(false)
      expect(output.code).toBe(0)
      expect(output.stdout).toContain('Tailing Valkey commands (container: voucha-test-valkey)')
      expect(output.stdout).toContain('Source: valkey-cli MONITOR')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
