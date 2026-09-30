import { TEST_PATHSPECS } from './config.mts'
import type { Git } from './git.mts'

export interface TestFilesDeps {
  git: Git
  /** Called once the files are gone, before the callback runs. */
  onRemoved?: (count: number) => void
  /** Deletes one repo-relative path; a path that is already missing is not an error. */
  remove: (file: string) => Promise<void>
}

const MAX_LISTED = 20
const splitNul = (text: string) => text.split('\0').filter(Boolean)

export const listTestFiles = async (git: Git) =>
  splitNul(await git(['ls-files', '-z', '--', ...TEST_PATHSPECS]))

/** Modified, staged, deleted, renamed or untracked files inside the removal pathspecs. */
export const listDirtyTestFiles = async (git: Git) =>
  splitNul(
    await git(['status', '--porcelain', '-z', '--untracked-files=all', '--', ...TEST_PATHSPECS]),
  )

/**
 * `--literal-pathspecs` keeps a file name containing `[` or `*` from acting as a glob, which could
 * otherwise overwrite an unrelated modified file.
 */
const restore = (git: Git, files: readonly string[]) =>
  git(
    [
      '--literal-pathspecs',
      'restore',
      '--source=HEAD',
      '--worktree',
      '--pathspec-from-file=-',
      '--pathspec-file-nul',
    ],
    files.join('\0'),
  )

const manualRestore = () =>
  `git restore --source=HEAD --worktree -- ${TEST_PATHSPECS.map(spec => `'${spec}'`).join(' ')}`

/** ` D path` records are unstaged deletions, which is what a SIGKILLed earlier run leaves behind. */
const looksInterrupted = (dirty: readonly string[]) =>
  dirty.every(record => record.startsWith(' D '))

function describeDirty(dirty: readonly string[]): string {
  const shown = dirty.slice(0, MAX_LISTED).map(record => `  ${record}`)
  const more = dirty.length - shown.length
  const hint = looksInterrupted(dirty)
    ? [
        `These look like deletions from a run that was killed; restore them with: ${manualRestore()}`,
      ]
    : []
  return [...shown, ...(more > 0 ? [`  ...and ${more} more`] : []), ...hint].join('\n')
}

/**
 * Runs `fn` while every tracked test file is deleted from the working tree, then restores the
 * files from HEAD whether `fn` succeeded, threw, or was aborted. Refuses to start when any test
 * file has local work, because restoring from HEAD would discard it.
 */
export async function withTestFilesRemoved<T>(
  deps: TestFilesDeps,
  fn: () => Promise<T>,
): Promise<T> {
  const dirty = await listDirtyTestFiles(deps.git)
  if (dirty.length > 0) {
    throw new Error(
      `Refusing to run: test files inside the removal pathspecs have local changes, and this check ` +
        `deletes and restores them from HEAD. Commit or stash them first:\n${describeDirty(dirty)}`,
    )
  }
  const files = await listTestFiles(deps.git)
  if (files.length === 0) {
    throw new Error(
      `No tracked files match the test pathspecs (${TEST_PATHSPECS.join(' ')}); ` +
        'the check would silently run with tests present. Update TEST_PATHSPECS.',
    )
  }
  let outcome: { ok: true; value: T } | { error: unknown; ok: false }
  try {
    await Promise.all(files.map(deps.remove))
    deps.onRemoved?.(files.length)
    outcome = { ok: true, value: await fn() }
  } catch (error) {
    outcome = { error, ok: false }
  }
  try {
    await restore(deps.git, files)
  } catch (error) {
    const earlier = outcome.ok ? '' : `\nThe run itself had failed first: ${String(outcome.error)}`
    throw new Error(
      `Could not restore ${files.length} deleted test files: ${String(error)}${earlier}\n` +
        `Restore them by hand with: ${manualRestore()}`,
      { cause: error },
    )
  }
  if (outcome.ok) return outcome.value
  throw outcome.error
}
