import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

async function makeFakePnpmBin(options: { checkExitCode?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-ci-bin-'))
  const pnpmPath = join(dir, 'pnpm')
  const argsPath = join(dir, 'pnpm-args.txt')

  await writeFile(
    pnpmPath,
    `#!/usr/bin/env bash
printf 'CALL\\n' >> "$PNPM_ARGS_PATH"
printf '%s\\n' "$@" >> "$PNPM_ARGS_PATH"
if [ "\${1:-}" = "check" ]; then
  exit ${options.checkExitCode ?? 0}
fi
`,
  )
  await chmod(pnpmPath, 0o755)

  return { argsPath, binDir: dir }
}

async function makeCoverageArtifactsDir() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-coverage-artifacts-'))
  await mkdir(join(dir, 'coverage-web-shard-1'), { recursive: true })
  await writeFile(
    join(dir, 'coverage-web-shard-1', 'lcov.info'),
    'TN:\nSF:web/example.ts\nDA:1,1\nend_of_record\n',
  )
  return dir
}

describe('coverage-artifacts.sh', () => {
  it('coverage-artifacts pr-check merges selected suites and runs one patch check', async () => {
    const { argsPath, binDir } = await makeFakePnpmBin()
    const artifactsDir = await makeCoverageArtifactsDir()
    const mergedDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-artifacts-merged-'))

    await execFileAsync('./ci/coverage-artifacts.sh', ['pr-check'], {
      env: {
        ...process.env,
        COVERAGE_ARTIFACTS_DIR: artifactsDir,
        COVERAGE_ARTIFACTS_MERGED_DIR: mergedDir,
        COVERAGE_BASE: 'origin/main',
        COVERAGE_HEAD: 'HEAD',
        COVERAGE_PR: '5019',
        COVERAGE_REPO: 'jonathanong/filaments',
        COVERAGE_CHECK_BIN: `${binDir}/pnpm`,
        PNPM_ARGS_PATH: argsPath,
      },
    })

    const args = await readFile(argsPath, 'utf8')
    expect(args).toContain('merge\n')
    expect(args).toContain(`--output\n${mergedDir}/lcov.info\n`)
    expect(args).toContain('--rules\n.coverage-rules.yml\n')
    expect(args).toContain('--suite\ncurrent-pr\n')
    expect(args).toContain('--base\norigin/main\n')
    expect(args).toContain('--head\nHEAD\n')
    expect(args).toContain(`--artifacts\n${mergedDir}\n`)
    expect(args).toContain('--pr\n5019\n')
    expect(args).toContain('--repo\njonathanong/filaments\n')
    expect(args.match(/^check$/gm)).toHaveLength(1)
    expect(args).not.toContain('--store-s3\n')
    expect(args).not.toContain('--drop-only\n')
    expect(args).not.toContain('--no-summary-file\n')

    const script = await readFile('./ci/coverage-artifacts.sh', 'utf8')
    expect(script).not.toContain(['COVERAGE', 'STORE', 'URI'].join('_'))
    expect(script).not.toContain(['store', 'main'].join('-'))
  })

  it('coverage-artifacts pr-check skips when all coverage producers are skipped', async () => {
    const { argsPath, binDir } = await makeFakePnpmBin()
    const artifactsDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-artifacts-empty-'))

    const { stdout } = await execFileAsync('./ci/coverage-artifacts.sh', ['pr-check'], {
      env: {
        ...process.env,
        COVERAGE_ARTIFACTS_DIR: artifactsDir,
        COVERAGE_BASE: 'origin/main',
        COVERAGE_HEAD: 'HEAD',
        COVERAGE_PR: '5019',
        COVERAGE_REPO: 'jonathanong/filaments',
        COVERAGE_CHECK_BIN: `${binDir}/pnpm`,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        PNPM_ARGS_PATH: argsPath,
      },
    })

    expect(stdout).toContain('No LCOV artifacts found; skipping PR patch coverage')
    await expect(readFile(argsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('coverage-artifacts pr-check propagates a patch failure', async () => {
    const { argsPath, binDir } = await makeFakePnpmBin({ checkExitCode: 7 })
    const artifactsDir = await makeCoverageArtifactsDir()
    const mergedDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-artifacts-merged-'))

    await expect(
      execFileAsync('./ci/coverage-artifacts.sh', ['pr-check'], {
        env: {
          ...process.env,
          COVERAGE_ARTIFACTS_DIR: artifactsDir,
          COVERAGE_ARTIFACTS_MERGED_DIR: mergedDir,
          COVERAGE_BASE: 'base-sha',
          COVERAGE_HEAD: 'head-sha',
          COVERAGE_PR: '5019',
          COVERAGE_REPO: 'jonathanong/filaments',
          COVERAGE_CHECK_BIN: `${binDir}/pnpm`,
          PNPM_ARGS_PATH: argsPath,
        },
      }),
    ).rejects.toMatchObject({ code: 7 })

    const args = await readFile(argsPath, 'utf8')
    expect(args.match(/^check$/gm)).toHaveLength(1)
  })
})
