import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const logsPath = fileURLToPath(new URL('../logs', import.meta.url))
const valkeyLogsPath = fileURLToPath(new URL('../valkey-logs', import.meta.url))
const execFileAsync = promisify(execFile)

type ScriptRun = {
  stdout: string
  stderr: string
}

async function createFakeWorkspace(databaseUrl?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-valkey-logs-'))
  const binDir = join(dir, 'bin')
  await mkdir(binDir)
  const envLines = ['echo noisy env output', 'export VALKEY_CONTAINER=voucha-test-valkey']
  if (databaseUrl !== undefined) {
    envLines.push(`export DATABASE_URL=${databaseUrl}`)
  }
  await writeFile(join(dir, '.env'), [...envLines, ''].join('\n'))

  const dockerPath = join(binDir, 'docker')
  await writeFile(
    dockerPath,
    [
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
    ].join('\n'),
  )
  await chmod(dockerPath, 0o755)

  const tailPath = join(binDir, 'tail')
  await writeFile(
    tailPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [ "${1:-}" != -f ] || [ -z "${2:-}" ]; then',
      '  printf "unexpected tail invocation: %s\\n" "$*" >&2',
      '  exit 2',
      'fi',
      'cat "$2"',
      '',
    ].join('\n'),
  )
  await chmod(tailPath, 0o755)

  return { binDir, dir }
}

async function runUntilStartupBanner(
  scriptPath: string,
  cwd: string,
  binDir: string,
): Promise<ScriptRun> {
  const result = await execFileAsync(scriptPath, [], {
    cwd,
    env: {
      ...process.env,
      BEDROCK_AWS_SECRET_ACCESS_KEY: 'parent-bedrock-secret',
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      S3_AWS_SECRET_ACCESS_KEY: 'parent-s3-secret',
      TMPDIR: cwd,
    },
    timeout: 5000,
  })
  return { stderr: result.stderr, stdout: result.stdout }
}

describe('dev Valkey log commands', () => {
  it('starts the Valkey monitor without printing database credentials', async () => {
    const workspace = await createFakeWorkspace(
      'postgres://dev:super-secret-password@dbhost:15432/voucha-test',
    )
    try {
      const output = await runUntilStartupBanner(valkeyLogsPath, workspace.dir, workspace.binDir)

      expect(output.stdout).toContain('Tailing Valkey commands (container: voucha-test-valkey)')
      expect(output.stdout).toContain('Source: valkey-cli MONITOR')
      expect(output.stdout).not.toContain('DATABASE_URL')
      expect(output.stdout).not.toContain('super-secret-password')
      expect(output.stdout).not.toContain('dbhost')
      expect(output.stderr).not.toContain('DATABASE_URL')
      expect(output.stderr).not.toContain('super-secret-password')
      expect(output.stderr).not.toContain('dbhost')
    } finally {
      await rm(workspace.dir, { force: true, recursive: true })
    }
  })

  it('keeps ./dev/logs as a compatibility alias without requiring DATABASE_URL', async () => {
    const workspace = await createFakeWorkspace()
    try {
      const output = await runUntilStartupBanner(logsPath, workspace.dir, workspace.binDir)

      expect(output.stdout).toContain('Tailing Valkey commands (container: voucha-test-valkey)')
      expect(output.stdout).toContain('Source: valkey-cli MONITOR')
    } finally {
      await rm(workspace.dir, { force: true, recursive: true })
    }
  })
})
