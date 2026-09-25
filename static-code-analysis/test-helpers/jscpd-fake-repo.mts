import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JscpdRunContext, ProcessExecutor, ProcessResult } from '../jscpd/process.mts'

export const SYNTHETIC_MERGE_BASE = 'ab'.repeat(20)
export const SYNTHETIC_MERGE_PARENT = 'cd'.repeat(20)
const SYNTHETIC_HEAD = '12'.repeat(20)
const SYNTHETIC_BRANCH_TIP = 'ef'.repeat(20)

export type FakeClone = {
  kind?: string
  isNew: boolean
  first: string
  second: string
}

export type FakeRepo = {
  ignore?: string[]
  tracked?: string[]
  untracked?: string[]
  markerHits?: { file: string; line: number }[]
  mergeBase?: ProcessResult
  // HEAD's parents; defaults to a pull_request merge commit.
  headParents?: string[]
  scan?: ProcessResult
  clones?: FakeClone[]
}

export type RecordedCall = { command: string; args: string[] }

export type FakeRun = {
  context: JscpdRunContext
  calls: RecordedCall[]
  logs: string[]
  errors: string[]
}

const ok = (stdout = ''): ProcessResult => ({ status: 0, stdout, stderr: '' })

// `name:start-end`, defaulting to lines 1-10.
function location(spec: string) {
  const [name = '', range = '1-10'] = spec.split(':')
  const [start, end] = range.split('-').map(Number)
  return { name, start, end, startLoc: {}, endLoc: {} }
}

export function reportJson(clones: FakeClone[]): string {
  return JSON.stringify({
    duplicates: clones.map(clone => ({
      format: 'typescript',
      fragment: 'const value = 1',
      isNew: clone.isNew,
      kind: clone.kind ?? 'exact',
      lines: location(clone.first).end - location(clone.first).start + 1,
      tokens: 60,
      firstFile: location(clone.first),
      secondFile: location(clone.second),
    })),
    statistics: { formats: {}, total: { clones: clones.length, sources: 3 } },
  })
}

function scanReport(repo: FakeRepo, args: string[]): ProcessResult {
  if (repo.scan) return repo.scan
  const outputDir = args[args.indexOf('--output') + 1] ?? ''
  writeFileSync(join(outputDir, 'jscpd-report.json'), reportJson(repo.clones ?? []))
  return ok('Using config: .jscpd.json\n')
}

function respond(repo: FakeRepo, command: string, args: string[]): ProcessResult {
  const [subcommand] = args
  if (command === 'pnpm') return scanReport(repo, args)
  if (command === 'git' && subcommand === 'ls-files') {
    const paths = args.includes('--others')
      ? (repo.untracked ?? [])
      : (repo.tracked ?? ['src/app.ts', 'test/fixtures/sample.ts'])
    return ok(paths.map(path => `${path}\0`).join(''))
  }
  if (command === 'git' && subcommand === 'grep') {
    const hits = repo.markerHits ?? []
    if (hits.length === 0) return { status: 1, stdout: '', stderr: '' }
    return ok(hits.map(hit => `${hit.file}\0${hit.line}\0// marker\n`).join(''))
  }
  if (command === 'git' && subcommand === 'merge-base') {
    return repo.mergeBase ?? ok(`${SYNTHETIC_MERGE_BASE}\n`)
  }
  if (command === 'git' && subcommand === 'rev-list') {
    const parents = repo.headParents ?? [SYNTHETIC_MERGE_PARENT, SYNTHETIC_BRANCH_TIP]
    return ok(`${[SYNTHETIC_HEAD, ...parents].join(' ')}\n`)
  }
  throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
}

// A temporary scan root holding `.jscpd.json`, plus a fake executor that answers git and jscpd.
export function createFakeRun(
  repo: FakeRepo,
  env: Record<string, string> = {},
): FakeRun & Disposable {
  const cwd = mkdtempSync(join(tmpdir(), 'run-jscpd-test-'))
  writeFileSync(
    join(cwd, '.jscpd.json'),
    JSON.stringify({ ignore: repo.ignore ?? ['**/fixtures/**'] }),
  )
  const calls: RecordedCall[] = []
  const logs: string[] = []
  const errors: string[] = []
  const execute: ProcessExecutor = (command, args) => {
    calls.push({ command, args })
    return respond(repo, command, args)
  }
  return {
    context: { cwd, env, execute, log: line => logs.push(line), error: line => errors.push(line) },
    calls,
    logs,
    errors,
    [Symbol.dispose]: () => rmSync(cwd, { force: true, recursive: true }),
  }
}

export function scanCall(run: FakeRun): RecordedCall | undefined {
  return run.calls.find(call => call.command === 'pnpm')
}
