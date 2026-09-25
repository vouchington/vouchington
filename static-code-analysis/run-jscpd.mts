import { spawnSync } from 'node:child_process'
import { mkdtempDisposableSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseJscpdCliArgs, selectBaseline } from './jscpd/cli.mts'
import {
  findInlineIgnoreMarkers,
  listTrackedFiles,
  listUntrackedPaths,
  resolveBaseline,
} from './jscpd/git.mts'
import {
  JSCPD_CONFIG_PATH,
  buildIgnoreArguments,
  findConfigGlobProblems,
  readIgnoreGlobs,
  untrackedIgnoreGlobs,
} from './jscpd/ignore-globs.mts'
import { runProcess, type JscpdRunContext } from './jscpd/process.mts'
import { JSCPD_REPORT_FILE, formatClone, parseJscpdReport } from './jscpd/report.mts'

const README = 'static-code-analysis/jscpd/README.md'

const NEW_CLONE_REMEDIATION = [
  'Remediation: extract the shared code into one helper and call it from both places. Editing',
  'inside an existing clone makes it new, so dedupe the code you touched. If the dedupe is out of',
  `scope, add a narrow "**/" ignore glob to ${JSCPD_CONFIG_PATH} with a row in the ${README}`,
  'exceptions table. Inline ignore markers are rejected.',
]

function findConfigProblems(context: JscpdRunContext, globs: string[]): string[] {
  const markerProblems = findInlineIgnoreMarkers(context).map(
    location =>
      `${location}: inline jscpd ignore markers are banned; dedupe the code or add a reviewed ${JSCPD_CONFIG_PATH} exception (${README}).`,
  )
  return [...findConfigGlobProblems(globs, listTrackedFiles(context)), ...markerProblems]
}

function scanArguments(baseline: string, ignore: string[], outputDir: string): string[] {
  return [
    'exec',
    'jscpd',
    '.',
    '--baseline-from-ref',
    baseline,
    ...ignore,
    '--reporters',
    'json',
    '--silent',
    '--output',
    outputDir,
  ]
}

export function runJscpd(args: string[], context: JscpdRunContext): number {
  const options = parseJscpdCliArgs(args)
  const globs = readIgnoreGlobs(readFileSync(join(context.cwd, JSCPD_CONFIG_PATH), 'utf8'))
  const problems = findConfigProblems(context, globs)
  if (problems.length > 0) {
    for (const problem of problems) context.error(problem)
    return 1
  }

  const baseline = resolveBaseline(context, selectBaseline(options, context.env))
  const ignore = buildIgnoreArguments([
    ...globs,
    ...untrackedIgnoreGlobs(listUntrackedPaths(context)),
  ])
  using outputDir = mkdtempDisposableSync(join(tmpdir(), 'jscpd-report-'))
  const scan = runProcess(context, 'pnpm', scanArguments(baseline.commit, ignore, outputDir.path))
  if (scan.status !== 0) {
    for (const output of [scan.stdout, scan.stderr]) if (output.trim()) context.error(output.trim())
    context.error(`jscpd failed with ${scan.status === null ? 'a signal' : `exit ${scan.status}`}.`)
    return scan.status || 1
  }

  const report = parseJscpdReport(readFileSync(join(outputDir.path, JSCPD_REPORT_FILE), 'utf8'))
  const newClones = report.clones.filter(clone => clone.isNew)
  if (newClones.length === 0) {
    context.log(
      `jscpd: no new clones against ${baseline.label}; ${report.sources} files scanned, ${report.clones.length} existing clones.`,
    )
    return 0
  }
  context.error(`jscpd: ${newClones.length} new clone(s) against ${baseline.label}:`)
  for (const clone of newClones) context.error(`  ${formatClone(clone)}`)
  for (const line of NEW_CLONE_REMEDIATION) context.error(line)
  return 1
}

if (import.meta.main) {
  try {
    process.exitCode = runJscpd(process.argv.slice(2), {
      cwd: process.cwd(),
      env: process.env,
      execute: spawnSync,
      log: line => console.log(line),
      error: line => console.error(line),
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
