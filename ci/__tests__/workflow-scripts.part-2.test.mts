import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join, relative } from 'node:path'

import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

import { writeVitestBlobManifest } from 'vouchington-tooling/vitest-blob-manifest'

const execFileAsync = promisify(execFile)

async function makeFakePnpmBin(options: { exitCode?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-ci-bin-'))
  const pnpmPath = join(dir, 'pnpm')
  const argsPath = join(dir, 'pnpm-args.txt')

  await writeFile(
    pnpmPath,
    `#!/usr/bin/env bash
if [ "$1" = exec ] && [ "$2" = vouchington ]; then
  shift 2
  exec "$VOUCHINGTON_BIN" "$@"
fi
printf '%s\\n' "$@" >> "$PNPM_ARGS_PATH"
exit ${options.exitCode ?? 0}
`,
  )
  await chmod(pnpmPath, 0o755)

  return { argsPath, binDir: dir, vouchingtonPath: './node_modules/.bin/vouchington' }
}

describe('workflow shell scripts', () => {
  it('prepares validated canonical reports before invoking Vitest merge', async () => {
    await expect(readFile('./ci/merge-vitest-reports.sh', 'utf8')).resolves.toContain(
      'pnpm exec vouchington prepare-vitest-reports',
    )
  })

  it('keeps the directly invoked Playwright OTel store script executable', async () => {
    const mainWebWorkflow = await readFile('.github/workflows/main-web.yml', 'utf8')

    expect(mainWebWorkflow).toContain('run: ./ci/store-playwright-otel.sh')
    const storeScriptMode =
      process.platform === 'win32' ? 0o111 : (await stat('ci/store-playwright-otel.sh')).mode
    expect(storeScriptMode & 0o111).not.toBe(0)
  })

  it('merge-vitest-reports selects validated reports into stable merge input names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-vitest-blobs-'))
    const { argsPath, binDir, vouchingtonPath } = await makeFakePnpmBin()
    const primary = join(dir, 'primary')
    const fallback = join(dir, 'fallback')
    const mergeDir = join(dir, 'merge-input')
    const primaryFromRoot = relative(process.cwd(), primary)
    const fallbackFromRoot = relative(process.cwd(), fallback)
    const mergeDirFromRoot = relative(process.cwd(), mergeDir)
    const bundle = join(fallback, 'vitest-blob-tooling')
    await mkdir(bundle, { recursive: true })
    await mkdir(primary)
    await writeFile(join(primary, '.invalid-tooling'), 'invalid archive\n')
    await writeFile(join(bundle, 'tooling.json'), '{}')
    writeVitestBlobManifest(bundle, {
      suite: 'tooling',
      repository: 'jonathanong/filaments',
      revision: 'a'.repeat(40),
      runId: '9131',
      runAttempt: 2,
    })

    const { stdout } = await execFileAsync(
      './ci/merge-vitest-reports.sh',
      [primaryFromRoot, fallbackFromRoot, mergeDirFromRoot],
      {
        env: {
          ...process.env,
          GITHUB_REPOSITORY: 'jonathanong/filaments',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_RUN_ID: '9131',
          GITHUB_SHA: 'a'.repeat(40),
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
          PNPM_ARGS_PATH: argsPath,
          VOUCHINGTON_BIN: vouchingtonPath,
          VITEST_REPORT_EXPECTATIONS: JSON.stringify({
            version: 'vitest-report-expectations:v2',
            attempt: 2,
            suites: [{ suite: 'tooling', minimumAttempt: 2 }],
          }),
        },
      },
    )

    const args = await readFile(argsPath, 'utf8')
    expect(stdout).toContain('::warning::Rejected Vitest primary report source: invalid-archive')
    expect(stdout).toContain('Selected Vitest report tooling from attempt 2 (fallback)')
    expect(args).toContain('vitest\nrun\n')
    expect(args).toContain(`--merge-reports=${mergeDirFromRoot}\n`)
    expect(await readFile(join(mergeDir, 'tooling.json'), 'utf8')).toBe('{}')
  })

  it('merge-vitest-reports removes stale merge input when no suites are expected', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-vitest-blobs-'))
    const { argsPath, binDir, vouchingtonPath } = await makeFakePnpmBin()
    const primary = join(dir, 'primary')
    const fallback = join(dir, 'fallback')
    const mergeDir = join(dir, 'merge-input')
    await mkdir(primary)
    await mkdir(fallback)
    await mkdir(mergeDir)
    await writeFile(join(mergeDir, 'previous.json'), '{}')

    await execFileAsync('./ci/merge-vitest-reports.sh', [primary, fallback, mergeDir], {
      env: {
        ...process.env,
        GITHUB_REPOSITORY: 'jonathanong/filaments',
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_RUN_ID: '9131',
        GITHUB_SHA: 'a'.repeat(40),
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        PNPM_ARGS_PATH: argsPath,
        VOUCHINGTON_BIN: vouchingtonPath,
        VITEST_REPORT_EXPECTATIONS: JSON.stringify({
          version: 'vitest-report-expectations:v2',
          attempt: 2,
          suites: [],
        }),
      },
    })

    await expect(readFile(argsPath, 'utf8')).rejects.toThrow(/ENOENT/)
    expect(await readdir(mergeDir)).toEqual([])
  })
})
