import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// The committed schema.json is already >1.5MB and only grows; `execFile`'s 1MB default `maxBuffer`
// truncates `git show <rev>:schema.json` output with ERR_CHILD_PROCESS_STDIO_MAXBUFFER. Matches the
// git-show precedent in ts-shared/ui-messages/native-consumer-source-discovery.mts.
const MAX_BUFFER_BYTES = 32 * 1024 * 1024

export type IndexRenameGit = {
  /** `git merge-base base head`, throwing with a diagnosable message on failure. */
  mergeBase(base: string, head: string): Promise<string>
  /** Throws unless the clone has full history — a shallow clone cannot resolve a merge-base. */
  assertNotShallow(): Promise<void>
  /** Throws unless `revision` resolves to a real commit. */
  assertResolvable(revision: string): Promise<void>
  /** `git show revision:path`, or `null` when the path does not exist at that revision. */
  showFile(revision: string, path: string): Promise<string | null>
  /**
   * Repo-root-relative paths of `.sql` files added to `dir` between `base` and `head`.
   * `--no-renames` prevents git's rename heuristic from reclassifying a genuinely new migration
   * file (one that happens to resemble a deleted one) as a rename, which would silently drop it
   * from the "added" set that acknowledgement depends on.
   */
  addedMigrationFiles(base: string, head: string, dir: string): Promise<string[]>
}

const NOT_DEEP_ENOUGH_HINT =
  "pair actions/checkout `fetch-depth: 0` with `./.github/actions/clean-workspace` `deepen: 'true'`."

/**
 * `git cat-file -e <revision>:<path>` reports a missing path as a fatal rev-parse error (exit 128,
 * same as an unresolvable revision), not the plain "object missing" exit 1 a bare object id would
 * get — so the exit code alone can't distinguish "path missing" from "something else went wrong."
 * Matching the exact fatal message git has used for this for years is the only signal available;
 * anything else (git binary crash, disk error, a revision that doesn't resolve) rethrows instead of
 * being silently folded into "not found," which would otherwise defeat the whole point of failing
 * loudly on a broken preflight instead of reporting zero renames.
 */
function isMissingPathError(err: unknown): boolean {
  return (
    err instanceof Error &&
    'stderr' in err &&
    typeof err.stderr === 'string' &&
    err.stderr.includes('does not exist in')
  )
}

/**
 * Shells out to `git` in `cwd` for the merge-base resolution, preflight, and file-reading that
 * `check-index-renames.mts` needs. Injectable by `cwd` so both the real CLI (cwd = the checked-out
 * repository) and tests (cwd = a `mkdtemp` fixture repo) exercise identical logic.
 */
export function createIndexRenameGit(cwd: string): IndexRenameGit {
  async function git(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: MAX_BUFFER_BYTES })
    return stdout.trim()
  }

  return {
    async mergeBase(base, head) {
      try {
        return await git(['merge-base', base, head])
      } catch (err) {
        throw new Error(
          `check-index-renames: could not compute a merge-base between ${base} and ${head} — ${NOT_DEEP_ENOUGH_HINT}`,
          { cause: err },
        )
      }
    },

    async assertNotShallow() {
      let isShallow: string
      try {
        isShallow = await git(['rev-parse', '--is-shallow-repository'])
      } catch (err) {
        throw new Error(
          `check-index-renames: could not determine whether the repository is a shallow clone — ${NOT_DEEP_ENOUGH_HINT}`,
          { cause: err },
        )
      }
      if (isShallow === 'true') {
        throw new Error(
          `check-index-renames: repository is a shallow clone — ${NOT_DEEP_ENOUGH_HINT}`,
        )
      }
    },

    async assertResolvable(revision) {
      try {
        await git(['rev-parse', '--verify', `${revision}^{commit}`])
      } catch (err) {
        throw new Error(
          `check-index-renames: revision ${revision} does not resolve to a commit — ${NOT_DEEP_ENOUGH_HINT}`,
          { cause: err },
        )
      }
    },

    async showFile(revision, path) {
      const exists = await execFileAsync('git', ['cat-file', '-e', `${revision}:${path}`], {
        cwd,
      }).then(
        () => true,
        (err: unknown) => {
          if (isMissingPathError(err)) return false
          throw err
        },
      )
      if (!exists) return null
      return git(['show', `${revision}:${path}`])
    },

    async addedMigrationFiles(base, head, dir) {
      const stdout = await git([
        'diff',
        '--no-renames',
        '--name-only',
        '--diff-filter=A',
        base,
        head,
        '--',
        dir,
      ])
      return stdout === '' ? [] : stdout.split('\n').filter(path => path.endsWith('.sql'))
    },
  }
}
