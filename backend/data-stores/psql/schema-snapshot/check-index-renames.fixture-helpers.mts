import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const fixtureRoots: string[] = []

// Passed as env instead of `git config` calls: avoids persisting fixture identity into any
// repo config file.
const FIXTURE_GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test Fixture',
  GIT_AUTHOR_EMAIL: 'test@example.test',
  GIT_COMMITTER_NAME: 'Test Fixture',
  GIT_COMMITTER_EMAIL: 'test@example.test',
}

export async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: root, env: FIXTURE_GIT_ENV })
  return stdout.trim()
}

async function write(root: string, path: string, contents: string): Promise<void> {
  const destination = join(root, path)
  await mkdir(join(destination, '..'), { recursive: true })
  await writeFile(destination, contents)
}

async function commit(root: string, files: Record<string, string>, message: string): Promise<void> {
  await Promise.all(Object.entries(files).map(([path, contents]) => write(root, path, contents)))
  await git(root, ['add', '--all'])
  await git(root, ['commit', '--quiet', '-m', message])
}

/**
 * A git-init'd temp repo for exercising `createIndexRenameGit()` against real `git` plumbing
 * instead of an injected double — the `--diff-filter=A`/`--no-renames` added-vs-pre-existing
 * migration distinction that `check-index-renames.mts` depends on cannot be faked meaningfully.
 */
export async function makeFixtureRepo(): Promise<{
  root: string
  commitFiles(files: Record<string, string>, message: string): Promise<string>
}> {
  const root = await mkdtemp(join(tmpdir(), 'check-index-renames-lifecycle-'))
  fixtureRoots.push(root)
  await git(root, ['init', '--quiet'])
  return {
    root,
    async commitFiles(files, message) {
      await commit(root, files, message)
      return git(root, ['rev-parse', 'HEAD'])
    },
  }
}

/** `git clone --depth 1` of a fixture repo, for exercising the shallow-clone preflight guard. */
export async function makeShallowClone(sourceRoot: string): Promise<string> {
  const shallowRoot = await mkdtemp(join(tmpdir(), 'check-index-renames-shallow-'))
  fixtureRoots.push(shallowRoot)
  // `git clone --depth 1 <local-path>` silently ignores --depth and does a full clone — git prints
  // "warning: --depth is ignored in local clones; use file:// instead." A `file://` URL forces the
  // smart-transport path so the shallow-clone preflight guard actually has a shallow repo to catch.
  await execFileAsync('git', ['clone', '--quiet', '--depth', '1', `file://${sourceRoot}`, '.'], {
    cwd: shallowRoot,
    env: FIXTURE_GIT_ENV,
  })
  return shallowRoot
}

export async function cleanupFixtureRepos(): Promise<void> {
  await Promise.all(fixtureRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
}
