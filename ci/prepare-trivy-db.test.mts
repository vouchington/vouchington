import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
      err => ({ error: err, ok: false as const }),
    )

    const calls = await readFile(callsPath, 'utf8').then(
      content => content.trim().split('\n'),
      (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') return []
        throw err
      },
    )

    return { calls, result }
  }

  it('falls back to official GHCR after a mirror failure', async () => {
    const { calls, result } = await runPrepareTrivyDb({ mirrorExit: 4 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected success')
    expect(result.value.stdout).toContain('retrying from official GHCR')
    const dbTag = /trivy-db:(\S+)$/.exec(calls[0] ?? '')?.[1] ?? ''
    expect(dbTag).toMatch(/^\d+$/)
    expect(calls).toEqual([
      `image --download-db-only --no-progress --timeout 75s --db-repository mirror.gcr.io/aquasec/trivy-db:${dbTag}`,
      `image --download-db-only --no-progress --timeout 75s --db-repository ghcr.io/aquasecurity/trivy-db:${dbTag}`,
    ])
  })

  it('runs the lockfile script without re-resolving tooling dependencies', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-trivy-db-fallback-'))
    testDirs.push(dir)
    const callsPath = join(dir, 'calls.txt')
    const pnpmCallsPath = join(dir, 'pnpm-calls.txt')
    const packageDir = join(dir, 'pkg', 'package', 'scripts', 'gha')
    const tarball = join(dir, 'tooling.tgz')
    await mkdir(packageDir, { recursive: true })
    await writeFile(
      join(packageDir, 'prepare-trivy-db.sh'),
      '#!/usr/bin/env bash\nprintf \'%s\\n\' "$*" >> "$TRIVY_CALLS_PATH"\n',
    )
    await execFileAsync('tar', ['-czf', tarball, 'package'], { cwd: join(dir, 'pkg') })
    const integrity = createHash('sha512')
      .update(await readFile(tarball))
      .digest('base64')

    const repo = join(dir, 'repo')
    const bin = join(dir, 'bin')
    await mkdir(join(repo, 'ci'), { recursive: true })
    await mkdir(bin, { recursive: true })
    await writeFile(
      join(repo, 'package.json'),
      JSON.stringify({ dependencies: { 'vouchington-tooling': '0.0.0-test' } }),
    )
    await writeFile(
      join(repo, 'pnpm-lock.yaml'),
      `importers:

  .:
    dependencies:
      vouchington-tooling:
        specifier: 0.0.0-test
        version: 0.0.0-test

packages:

  vouchington-tooling@0.0.0-test:
    resolution: {integrity: sha512-${integrity.trim()}}
`,
    )
    for (const name of [
      'prepare-trivy-db.sh',
      'exec-vouchington-gha.sh',
      'vouchington-tooling-script.sh',
      'curl-to.sh',
    ]) {
      await writeFile(join(repo, 'ci', name), await readFile(join('ci', name)))
      await chmod(join(repo, 'ci', name), 0o755)
    }
    await writeFile(
      join(bin, 'pnpm'),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$PNPM_CALLS_PATH"
exit 1
`,
    )
    await writeFile(
      join(bin, 'curl'),
      `#!/usr/bin/env bash
output=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--output" ]; then
    output="$argument"
  fi
  previous="$argument"
done
cp "$FIXTURE_TGZ" "$output"
printf '200'
`,
    )
    await chmod(join(bin, 'pnpm'), 0o755)
    await chmod(join(bin, 'curl'), 0o755)

    const result = await execFileAsync(
      join(repo, 'ci', 'prepare-trivy-db.sh'),
      ['--from-lockfile'],
      {
        cwd: repo,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          FIXTURE_TGZ: tarball,
          PNPM_CALLS_PATH: pnpmCallsPath,
          TRIVY_CALLS_PATH: callsPath,
        },
      },
    ).then(
      value => ({ ok: true as const, value }),
      err => ({ error: err, ok: false as const }),
    )
    const calls = await readFile(callsPath, 'utf8').then(
      content => content.trim().split('\n'),
      (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') return []
        throw err
      },
    )
    const pnpmCalls = await readFile(pnpmCallsPath, 'utf8').then(
      content => content.trim(),
      (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') return ''
        throw err
      },
    )

    if (!result.ok) {
      throw new Error(pnpmCalls || 'prepare-trivy-db failed')
    }
    expect(calls).toEqual(['--from-lockfile'])
    expect(pnpmCalls).toBe('')
  })
})
