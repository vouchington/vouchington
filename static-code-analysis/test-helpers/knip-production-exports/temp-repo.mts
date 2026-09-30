import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const dirs: string[] = []

export function runGit(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

export function writeRepoFile(dir: string, file: string, content: string) {
  mkdirSync(dirname(join(dir, file)), { recursive: true })
  writeFileSync(join(dir, file), content)
}

/** A throwaway git repository with every given file committed. */
export function makeTempRepo(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'voucha-knip-production-exports-'))
  dirs.push(dir)
  runGit(dir, 'init', '-q', '-b', 'main')
  runGit(dir, 'config', 'user.email', 'tests+knip-production-exports@voucha.ai')
  runGit(dir, 'config', 'user.name', 'Test User')
  runGit(dir, 'config', 'commit.gpgsign', 'false')
  for (const [file, content] of Object.entries(files)) writeRepoFile(dir, file, content)
  runGit(dir, 'add', '-A')
  runGit(dir, 'commit', '-q', '-m', 'seed')
  return dir
}

export function removeTempRepos() {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true })
}
