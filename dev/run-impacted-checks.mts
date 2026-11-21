import { spawnSync } from 'node:child_process'

// Pre-push runner: only checks that take the changed files as arguments, so cost scales with the
// diff. Whole-repository scans (no-mistakes rules, knip, jscpd, depcruise, full oxlint), test
// suites and anything needing a database or `.env` stay in CI. The lint command and its file
// globs mirror `oxlint-type-aware` in .no-mistakes/checks/default.yml (`fileArgs: append`).
// Exit codes: 0 passed or nothing to check, 1 a check failed, 2 the runner could not run.
const LINTABLE = /\.(?:ts|tsx|mts|cts)$/
const CHUNK = 500

function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout
}

function changedPaths(): string[] {
  const base = git(['merge-base', 'origin/main', 'HEAD']).trim()
  const lists = [
    git(['diff', '--no-renames', '--diff-filter=d', '--name-only', '-z', base, '--']),
    git(['ls-files', '--others', '--exclude-standard', '-z']),
  ]
  return [...new Set(lists.flatMap(list => list.split('\0').filter(Boolean)))].toSorted()
}

function runChunked(name: string, command: string[], files: string[]): boolean {
  if (files.length === 0) return true
  const started = performance.now()
  for (let index = 0; index < files.length; index += CHUNK) {
    const result = spawnSync('pnpm', ['exec', ...command, ...files.slice(index, index + CHUNK)], {
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      process.stderr.write(`FAILED ${name}\n`)
      return false
    }
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  process.stdout.write(`ok ${name}: ${String(files.length)} files, ${seconds}s\n`)
  return true
}

function main(): number {
  const paths = changedPaths()
  const results = [
    runChunked(
      'oxlint --type-aware',
      ['oxlint', '--type-aware', '--deny-warnings', '--no-error-on-unmatched-pattern'],
      paths.filter(path => LINTABLE.test(path)),
    ),
    runChunked('oxfmt --check', ['oxfmt', '--check', '--no-error-on-unmatched-pattern'], paths),
  ]
  return results.every(Boolean) ? 0 : 1
}

try {
  process.exitCode = main()
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 2
}
