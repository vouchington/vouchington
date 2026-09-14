import { execFile } from 'node:child_process'

import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { dirname, join } from 'node:path'

import { fileURLToPath } from 'node:url'

import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const devDir = fileURLToPath(new URL('..', import.meta.url))
const testDirs: string[] = []

const removedDirectories = [
  'dist',
  'output',
  'storybook-static',
  'web/.next',
  'cloudflare-worker/.wrangler',
  'cloudflare-worker/dist',
  'web/storybook-static',
  'email-templates/dist',
  'lambdas/image-resize/dist',
  'coverage',
  'coverage-affected',
  'coverage-changed',
  'coverage-full',
  'coverage-html',
  'coverage-artifacts',
  'playwright-report',
  'test-results',
  '.playwright-snapshots',
  'playwright/screenshots',
  '.cache',
  'node_modules/.cache',
  'web/node_modules/.vite',
  'backend/node_modules/.vitest',
]

const alwaysPreservedFiles = [
  '.env',
  'node_modules/example-dependency/index.js',
  'web/node_modules/example-dependency/index.js',
  'dev/certs/local.pem',
  'playwright/.auth/user.json',
]

const ordinaryResetPreservedFiles = ['coverage-not-build-output/keep.txt', 'unrelated/keep.txt']

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function writeExecutable(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  await chmod(path, 0o755)
}

async function makeFakeBin() {
  const binDir = await mkdtemp(join(tmpdir(), 'voucha-reset-build-bin-'))
  testDirs.push(binDir)
  await writeExecutable(
    join(binDir, 'git'),
    `#!/usr/bin/env bash
if [ "$1" = "-C" ]; then repo="$2"; shift 2; fi
case "$*" in
  "rev-parse --show-toplevel") printf '%s' "\${repo:-$(pwd)}" ;;
  "diff-index --quiet HEAD --"|"status --porcelain --untracked-files=normal"|"fetch origin main"|"checkout -B "*|"reset --hard origin/main"|"clean -fd") : ;;
  *) printf 'unexpected git invocation: %s\n' "$*" >&2; exit 1 ;;
esac
`,
  )
  await writeExecutable(
    join(binDir, 'openssl'),
    '#!/usr/bin/env bash\nif [ "$1" = rand ]; then printf "cafef00d\\n"; else cat >/dev/null; printf "deadbeefcafe%052d\\n" 0; fi\n',
  )
  await writeExecutable(
    join(binDir, 'tmux'),
    '#!/usr/bin/env bash\nif [ "$1" = "display-message" ]; then printf "@0\\n"; fi\n',
  )
  return binDir
}

async function makeRepo() {
  const repo = await mkdtemp(join(tmpdir(), 'voucha-reset-build-'))
  testDirs.push(repo)
  await mkdir(join(repo, 'dev', 'lib'), { recursive: true })
  const publishedHelper = 'node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh'
  await mkdir(join(repo, 'node_modules/vouchington-tooling/scripts/worktree'), { recursive: true })
  await writeFile(
    join(repo, publishedHelper),
    await readFile(join(devDir, '..', publishedHelper), 'utf8'),
  )
  await writeFile(join(repo, '.git'), 'gitdir: /fake/.git/worktrees/test\n')

  for (const relativePath of [
    'reset-worktree',
    'tmux-name',
    'lib/refuse-on-main.sh',
    'lib/git-worktrees.sh',
    'lib/worktree-resource-env.sh',
    'lib/db-name-from-url.sh',
    'lib/git-index-lock.sh',
  ]) {
    const destination = join(repo, 'dev', relativePath)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, await readFile(join(devDir, relativePath), 'utf8'))
    if (!relativePath.startsWith('lib/')) await chmod(destination, 0o755)
  }
  await writeExecutable(join(repo, 'dev', 'initialize'), '#!/usr/bin/env bash\n: "$1"\n')

  for (const directory of removedDirectories) {
    await mkdir(join(repo, directory), { recursive: true })
    await writeFile(join(repo, directory, 'generated-output'), 'generated')
  }
  await writeFile(join(repo, 'test-report.junit.xml'), 'generated')
  await mkdir(join(repo, '.local'), { recursive: true })
  await writeFile(join(repo, '.local/codex-session-id'), 'codex-old\n')
  await writeFile(join(repo, '.local/cursor-session-id'), 'cursor-old\n')
  await writeFile(join(repo, '.local/grok-session-id'), 'grok-old\n')
  for (const file of [...alwaysPreservedFiles, ...ordinaryResetPreservedFiles]) {
    await mkdir(dirname(join(repo, file)), { recursive: true })
    await writeFile(join(repo, file), file === '.env' ? 'export PORT=3900\n' : 'preserved')
  }
  return repo
}

describe('reset-worktree generated output cleanup', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  for (const [label, args] of [
    ['ordinary', []],
    ['forced', ['--force']],
  ] as const) {
    it(`removes generated output during a ${label} reset`, async () => {
      const repo = await makeRepo()
      const binDir = await makeFakeBin()
      const result = await execFileAsync('bash', [join(repo, 'dev', 'reset-worktree'), ...args], {
        cwd: repo,
        env: { ...process.env, PATH: `${binDir}:/usr/bin:/bin` },
      })

      const remainingGeneratedPaths = await Promise.all(
        [...removedDirectories, 'test-report.junit.xml'].map(async path => ({
          exists: await pathExists(join(repo, path)),
          path,
        })),
      )
      expect(remainingGeneratedPaths.filter(({ exists }) => exists)).toEqual([])

      const expectedPreservedFiles = [
        ...alwaysPreservedFiles,
        ...(args.length === 0 ? ordinaryResetPreservedFiles : []),
      ]
      const missingPreservedPaths = await Promise.all(
        expectedPreservedFiles.map(async path => ({
          exists: await pathExists(join(repo, path)),
          path,
        })),
      )
      expect(missingPreservedPaths.filter(({ exists }) => !exists)).toEqual([])
      expect(await pathExists(join(repo, '.local/codex-session-id'))).toBe(true)
      expect(await pathExists(join(repo, '.local/cursor-session-id'))).toBe(false)
      expect(await pathExists(join(repo, '.local/grok-session-id'))).toBe(false)
      expect(await readFile(join(repo, '.env'), 'utf8')).toContain('export PORT=3900')

      expect(result.stdout.indexOf('at origin/main')).toBeLessThan(
        result.stdout.indexOf('Removing generated build and test output'),
      )
      expect(result.stdout.indexOf('Removing generated build and test output')).toBeLessThan(
        result.stdout.indexOf('Initializing monorepo tools'),
      )
    })
  }
})
