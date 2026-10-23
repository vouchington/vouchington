import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
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

const dockerFakePath = fileURLToPath(
  new URL('../test-helpers/valkey-logs-docker.sh', import.meta.url),
)
const tailFakePath = fileURLToPath(new URL('../test-helpers/valkey-logs-tail.sh', import.meta.url))

let binRoot: string
let binDir: string

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
    // Execute immutable fixtures: freshly written executable files can still be
    // busy at first exec under concurrent process startup (ETXTBSY).
    await Promise.all([
      symlink(dockerFakePath, join(binDir, 'docker')),
      symlink(tailFakePath, join(binDir, 'tail')),
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
