import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { sourceBashArgs } from './test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)
const helperPath = fileURLToPath(new URL('./lib/git-worktrees.sh', import.meta.url))
const testDirs: string[] = []

async function makeRepoRoot() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-git-worktrees-'))
  testDirs.push(dir)
  return dir
}

async function runHelper({
  repoRoot,
  porcelain,
  script,
  cwd,
}: {
  repoRoot: string
  porcelain: string
  script: string
  cwd?: string
}) {
  const command = `
    git() {
      case "$*" in
      *"worktree list --porcelain"*)
        printf '%b' "$PORCELAIN"
        return 0
        ;;
      esac
      printf 'unexpected git invocation: %s\\n' "$*" >&2
      exit 1
    }
    ${script}
  `

  const result = await execFileAsync('bash', sourceBashArgs(helperPath, command), {
    cwd,
    env: {
      ...process.env,
      FAKE_REPO_ROOT: repoRoot,
      PORCELAIN: porcelain,
    },
  })

  return result.stdout.trim()
}

describe('git-worktrees helpers', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('parses live, prunable, main, and registered worktree paths', async () => {
    const repoRoot = await makeRepoRoot()
    const liveWorktree = join(repoRoot, 'live-worktree')
    const prunableWorktree = join(repoRoot, 'prunable-worktree')
    await mkdir(liveWorktree, { recursive: true })

    const porcelain = [
      `worktree ${repoRoot}`,
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      `worktree ${liveWorktree}`,
      'HEAD def456',
      'branch refs/heads/feature',
      '',
      `worktree ${prunableWorktree}`,
      'HEAD ghi789',
      'branch refs/heads/stale',
      'prunable',
      '',
    ].join('\n')

    const liveOutput = await runHelper({
      repoRoot,
      porcelain,
      script: `
        git_worktree_live_paths "$FAKE_REPO_ROOT" | sed 's/^/live:/'
      `,
    })
    const prunableOutput = await runHelper({
      repoRoot,
      porcelain,
      script: `git_worktree_prunable_paths "$FAKE_REPO_ROOT" | sed 's/^/prunable:/'`,
    })
    const mainOutput = await runHelper({
      repoRoot,
      porcelain,
      script: `printf 'main:%s' "$(git_worktree_main_path "$FAKE_REPO_ROOT")"`,
    })
    const registeredOutput = await runHelper({
      repoRoot,
      porcelain,
      script: `
        if git_worktree_path_is_registered "$FAKE_REPO_ROOT" "${liveWorktree}"; then
          printf 'registered:yes'
        else
          printf 'registered:no'
        fi
      `,
    })
    const missingOutput = await runHelper({
      repoRoot,
      porcelain,
      script: `
        if git_worktree_path_is_registered "$FAKE_REPO_ROOT" "${liveWorktree}-missing"; then
          printf 'missing:yes'
        else
          printf 'missing:no'
        fi
      `,
    })

    expect(
      [liveOutput, prunableOutput, mainOutput, registeredOutput, missingOutput].join('\n'),
    ).toBe(
      [
        `live:${repoRoot}`,
        `live:${liveWorktree}`,
        `prunable:${prunableWorktree}`,
        `main:${repoRoot}`,
        'registered:yes',
        'missing:no',
      ].join('\n'),
    )
  })

  it('derives worktree names from paths under /worktrees/', async () => {
    const repoRoot = await makeRepoRoot()
    const codexWorktree = join(repoRoot, '.codex', 'worktrees', 'a7e6', 'voucha')
    await mkdir(codexWorktree, { recursive: true })

    const output = await runHelper({
      repoRoot,
      porcelain: '',
      cwd: codexWorktree,
      script: `printf '%s' "$(worktree_dir_from_path "$PWD")"`,
    })

    expect(output).toBe('a7e6/voucha')
  })

  it('keeps resource identities hashed when display paths contain nested worktree markers', async () => {
    const nestedPath = join(tmpdir(), 'repo', 'worktrees', 'outer', 'worktrees', 'inner')
    await mkdir(nestedPath, { recursive: true })
    await writeFile(join(nestedPath, '.git'), 'gitdir: /fake/.git/worktrees/inner\n')
    const resourceEnvHelperPath = fileURLToPath(
      new URL('./lib/worktree-resource-env.sh', import.meta.url),
    )

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(resourceEnvHelperPath, 'worktree_resource_dir_from_path "$1"', [nestedPath]),
    )

    expect(stdout.trim()).toMatch(/^d[0-9a-f]{12}$/)
  })

  it('normalizes CRLF porcelain records', async () => {
    const repoRoot = await makeRepoRoot()
    const liveWorktree = join(repoRoot, 'live-worktree')
    const prunableWorktree = join(repoRoot, 'prunable-worktree')
    await mkdir(liveWorktree, { recursive: true })

    const porcelain = [
      `worktree ${liveWorktree}\r`,
      'HEAD abc123\r',
      'branch refs/heads/feature\r',
      '\r',
      `worktree ${prunableWorktree}\r`,
      'HEAD def456\r',
      'branch refs/heads/stale\r',
      'prunable gitdir file points to non-existent location\r',
      '',
    ].join('\n')

    const output = await runHelper({
      repoRoot,
      porcelain,
      script: `
        git_worktree_live_paths "$FAKE_REPO_ROOT" | sed 's/^/live:/'
        printf 'prunable:%s' "$(git_worktree_prunable_paths "$FAKE_REPO_ROOT")"
      `,
    })

    expect(output).toBe([`live:${liveWorktree}`, `prunable:${prunableWorktree}`].join('\n'))
  })
})
