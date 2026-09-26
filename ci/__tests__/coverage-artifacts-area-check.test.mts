import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

// The fake coverage-check logs its arguments and snapshots the generated --rules file; the fake git
// reports web/trailing.ts as a whitespace-only change.
async function makeFakeBinDir(options: { checkExitCode?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-ci-bin-'))
  const argsPath = join(dir, 'coverage-check-args.txt')
  const rulesPath = join(dir, 'area-rules.yml')

  await writeFile(
    join(dir, 'coverage-check'),
    `#!/usr/bin/env bash
printf 'CALL\\n' >> "$ARGS_PATH"
printf '%s\\n' "$@" >> "$ARGS_PATH"
if [ "\${1:-}" = "check" ]; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--rules" ]; then cp "$2" "$RULES_PATH"; fi
    shift
  done
  exit ${options.checkExitCode ?? 0}
fi
`,
  )
  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
if [ "$1" = "diff" ] && [ "$3" = "--ignore-space-at-eol" ]; then exit 0; fi
if [ "$1" = "diff" ]; then printf '%s\\n' 'web/trailing.ts'; exit 0; fi
exit 1
`,
  )
  await chmod(join(dir, 'coverage-check'), 0o755)
  await chmod(join(dir, 'git'), 0o755)
  return { argsPath, binDir: dir, rulesPath }
}

async function makeArtifactsDir(withLcov: boolean) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-coverage-artifacts-'))
  if (withLcov) {
    await mkdir(join(dir, 'lcov-full-lambdas'), { recursive: true })
    await writeFile(
      join(dir, 'lcov-full-lambdas', 'lcov.info'),
      'TN:\nSF:lambdas/example.mts\nDA:1,1\nend_of_record\n',
    )
  }
  return dir
}

async function runAreaCheck(options: { checkExitCode?: number; withLcov?: boolean } = {}) {
  const fake = await makeFakeBinDir(options)
  const mergedDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-artifacts-merged-'))
  const run = execFileAsync('./ci/coverage-artifacts.sh', ['area-check'], {
    env: {
      ...process.env,
      ARGS_PATH: fake.argsPath,
      COVERAGE_AREA: 'lambdas',
      COVERAGE_ARTIFACTS_DIR: await makeArtifactsDir(options.withLcov ?? true),
      COVERAGE_ARTIFACTS_MERGED_DIR: mergedDir,
      COVERAGE_BASE: 'base-ref',
      COVERAGE_CHECK_BIN: join(fake.binDir, 'coverage-check'),
      COVERAGE_HEAD: 'head-ref',
      PATH: `${fake.binDir}:${process.env.PATH ?? ''}`,
      RULES_PATH: fake.rulesPath,
    },
  })
  return { ...fake, mergedDir, run }
}

describe('coverage-artifacts.sh area-check', () => {
  it('merges the area LCOV and checks it against only the area-owned rules', async () => {
    const { argsPath, mergedDir, rulesPath, run } = await runAreaCheck()
    await run

    const args = await readFile(argsPath, 'utf8')
    expect(args).toContain(`merge\n--artifacts\n`)
    expect(args).toContain(`--output\n${mergedDir}/lcov.info\n`)
    expect(args).toContain(`--artifacts\n${mergedDir}\n`)
    expect(args).toContain('--suite\nlambdas\n--base\nbase-ref\n--head\nhead-ref\n')
    expect(args).toContain('--ignore-path\nweb/trailing.ts\n')
    expect(args).not.toContain('--pr\n')
    expect(args.match(/^check$/gm)).toHaveLength(1)

    const rules = parse(await readFile(rulesPath, 'utf8')) as {
      rules: Array<{ paths: string; patch_coverage_min: number }>
    }
    expect(rules.rules.filter(rule => rule.patch_coverage_min > 0)).toEqual([
      { paths: 'lambdas/**', patch_coverage_min: 100 },
    ])
  })

  it('fails without LCOV, because a succeeded suite always uploads its report', async () => {
    const { argsPath, run } = await runAreaCheck({ withLcov: false })

    await expect(run).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('lambdas area coverage gate'),
    })
    await expect(readFile(argsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('propagates a patch coverage failure', async () => {
    const { run } = await runAreaCheck({ checkExitCode: 7 })

    await expect(run).rejects.toMatchObject({ code: 7 })
  })
})
