/**
 * Scopes transcript discovery in dev/sandbox-command-audit.mts to the repo it's run
 * from. Without this, discovery walks every repo the user has ever worked in
 * (~/.claude/projects/**, ~/.codex/sessions/**) while policy loads from process.cwd()
 * only — every other repo's commands get systematically misreported as this repo's
 * allowlist gaps (root cause of #9406). Every git dependency is injectable so tests
 * never shell to real git — see dev/pr-description/provenance.mts for the pattern
 * this follows. Reading a transcript's own recorded cwd is the other half of this fix —
 * see ./transcript-cwd.mts (split out to stay under the 200-line-per-file cap).
 */

import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// A root or candidate path that doesn't exist (a since-deleted worktree, a transcript's
// recorded cwd for a directory since removed) falls back to the literal string rather
// than throwing — canonicalization is a best-effort symlink-resolution step, not a
// validation that the path currently exists.
async function safeRealpath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return path
  }
}

export type RepoScopeDeps = {
  gitCommonDir?: (cwd: string) => Promise<string>
  gitWorktreeList?: (cwd: string) => Promise<string[]>
}

async function defaultGitCommonDir(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', [
    '-C',
    cwd,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ])
  return stdout.trim()
}

// `git worktree list --porcelain` emits one `worktree <path>` line per entry (the main
// checkout first, then each linked worktree), separated by blank lines — only the
// `worktree` lines matter here.
async function defaultGitWorktreeList(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'worktree', 'list', '--porcelain'])
  return stdout
    .split('\n')
    .filter(line => line.startsWith('worktree '))
    .map(line => line.slice('worktree '.length).trim())
}

function isWithinRoot(candidate: string, root: string): boolean {
  const boundary = root.endsWith(sep) ? root : `${root}${sep}`
  return candidate === root || candidate.startsWith(boundary)
}

// Drops any root already contained in another root, so isWithinRepoRoots stays a
// short list to check per file rather than growing with every worktree — 69 real
// worktrees collapse to 3 roots (the main checkout plus the two that happen to live
// outside it).
function minimizeRoots(roots: string[]): string[] {
  const unique = [...new Set(roots)]
  return unique.filter(root => !unique.some(other => other !== root && isWithinRoot(root, other)))
}

/**
 * Roots this audit run should treat as "this repo": the explicit `--repo-root`
 * value(s) when given, otherwise the main checkout (covers every worktree nested
 * under it — `.claude/worktrees/*`, `.codex/worktrees/*`, `.worktrees/*`) unioned with
 * every worktree `git worktree list` knows about (covers the rare worktree that lives
 * outside the repo root), then minimized. A worktree whose directory has since been
 * deleted is silently absent from `git worktree list` too, so a session that ran in
 * one is unrecoverable from this function alone — `--repo-root` is the escape hatch
 * for that gap. Every root is canonicalized with `safeRealpath` (once here, not per
 * file) so a symlinked worktree path compares correctly against a transcript's
 * recorded cwd, which `isWithinRepoRoots` canonicalizes the same way per candidate.
 * A relative `--repo-root` is resolved against `cwd`, not the process's cwd at some
 * other point — the caller always passes `process.cwd()` from the CLI entrypoint. Not
 * specially handled: a bare repo (no worktree at all) makes `--git-common-dir` and
 * `worktree list` behave unusually, and either git call can fail outright (not a git
 * repo, `git` missing). Both surface as a git error rejecting this promise; the CLI
 * entrypoint (`dev/sandbox-command-audit.mts`'s `run()`) catches that and reports it as
 * an unavailable status pointing at `--repo-root` rather than crashing.
 */
export async function resolveRepoRoots(
  explicit: string[] | undefined,
  cwd: string,
  deps: RepoScopeDeps = {},
): Promise<string[]> {
  if (explicit !== undefined && explicit.length > 0) {
    const resolved = await Promise.all(explicit.map(root => safeRealpath(resolve(cwd, root))))
    return minimizeRoots(resolved)
  }
  const gitCommonDir = deps.gitCommonDir ?? defaultGitCommonDir
  const gitWorktreeList = deps.gitWorktreeList ?? defaultGitWorktreeList
  const [commonDir, worktrees] = await Promise.all([gitCommonDir(cwd), gitWorktreeList(cwd)])
  const roots = await Promise.all([dirname(commonDir), ...worktrees].map(safeRealpath))
  return minimizeRoots(roots)
}

// Path-boundary safe: `/repo-two` must never match root `/repo` just because it
// shares a string prefix. The candidate is canonicalized before the lexical check so a
// symlinked cwd (e.g. macOS's /tmp -> /private/tmp) compares against the
// already-canonicalized roots correctly.
export async function isWithinRepoRoots(cwd: string, roots: string[]): Promise<boolean> {
  const resolvedCwd = await safeRealpath(cwd)
  return roots.some(root => isWithinRoot(resolvedCwd, root))
}
