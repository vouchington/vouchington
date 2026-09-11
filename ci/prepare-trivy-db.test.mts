import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('prepare-trivy-db', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function runPrepareTrivyDb(options: { ghcrExit?: number; mirrorExit?: number } = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-trivy-db-'))
    testDirs.push(dir)
    const callsPath = join(dir, 'calls.txt')
    const trivyPath = join(dir, 'trivy')

    await writeFile(
      trivyPath,
      `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TRIVY_CALLS_PATH"
case "$*" in
  *mirror.gcr.io*) exit \${TRIVY_MIRROR_EXIT:-0} ;;
  *ghcr.io*) exit \${TRIVY_GHCR_EXIT:-0} ;;
  *) exit 97 ;;
esac
`,
    )
    await chmod(trivyPath, 0o755)

    const result = await execFileAsync('./ci/prepare-trivy-db.sh', {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ''}`,
        TRIVY_CALLS_PATH: callsPath,
        TRIVY_GHCR_EXIT: String(options.ghcrExit ?? 0),
        TRIVY_MIRROR_EXIT: String(options.mirrorExit ?? 0),
      },
    }).then(
      value => ({ ok: true as const, value }),
      error => ({ error, ok: false as const }),
    )

    const calls = await readFile(callsPath, 'utf8').then(
      content => content.trim().split('\n'),
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      },
    )

    return { calls, result }
  }

  it('falls back to official GHCR after a mirror failure', async () => {
    const { calls, result } = await runPrepareTrivyDb({ mirrorExit: 4 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected success')
    expect(result.value.stdout).toContain('retrying from official GHCR')
    expect(calls).toEqual([
      'image --download-db-only --no-progress --timeout 75s --db-repository mirror.gcr.io/aquasec/trivy-db:2',
      'image --download-db-only --no-progress --timeout 75s --db-repository ghcr.io/aquasecurity/trivy-db:2',
    ])
  })
})
