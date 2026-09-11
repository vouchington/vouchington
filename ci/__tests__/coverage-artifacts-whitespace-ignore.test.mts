import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

async function makeFakeBinDir() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-ci-bin-'))
  const argsPath = join(dir, 'pnpm-args.txt')

  await writeFile(
    join(dir, 'pnpm'),
    `#!/usr/bin/env bash
printf '%s\\n' "$@" >> "$PNPM_ARGS_PATH"
exit 0
`,
  )
  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
if [ "$1" = "diff" ] && [ "$2" = "--name-only" ] && [ "$3" = "--ignore-space-at-eol" ]; then
  printf '%s\\n' 'web/content.ts'
  exit 0
fi
if [ "$1" = "diff" ] && [ "$2" = "--name-only" ]; then
  printf '%s\\n' 'web/content.ts' 'web/trailing.ts'
  exit 0
fi
exit 1
`,
  )
  await chmod(join(dir, 'pnpm'), 0o755)
  await chmod(join(dir, 'git'), 0o755)
  return { argsPath, binDir: dir }
}

describe('coverage-artifacts whitespace-only patch coverage ignores', () => {
  it('passes only trailing-whitespace-only changed files to coverage-check ignore-path', async () => {
    const { argsPath, binDir } = await makeFakeBinDir()
    const artifactsDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-artifacts-'))
    await mkdir(join(artifactsDir, 'coverage-web'), { recursive: true })
    await writeFile(
      join(artifactsDir, 'coverage-web', 'lcov.info'),
      'TN:\nSF:web/content.ts\nDA:1,1\nend_of_record\n',
    )

    await execFileAsync('./ci/coverage-artifacts.sh', ['pr-check'], {
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

    const args = await readFile(argsPath, 'utf8')
    expect(args).toContain('--ignore-path\nweb/trailing.ts\n')
    expect(args).not.toContain('--ignore-path\nweb/content.ts\n')
  })
})
