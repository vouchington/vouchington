import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SelectedCheck = { name: string; kind: string; command: string[]; files?: string[] }

export function run(command: string, args: string[], capture = false) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) throw new Error(`${command}: ${result.error.message}`)
  if (result.signal) throw new Error(`${command}: terminated by ${result.signal}`)
  if (result.status !== 0) {
    if (capture) process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`)
    throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}`)
  }
  return result.stdout ?? ''
}

function gitPaths(args: string[]): string[] {
  return run('git', args, true).split('\0').filter(Boolean)
}

function changedPaths(base: string): string[] {
  return [
    ...new Set([
      ...gitPaths(['diff', '--no-renames', '--name-only', '-z', base, '--']),
      ...gitPaths(['ls-files', '--others', '--exclude-standard', '-z']),
    ]),
  ].toSorted()
}

export function parseSelectedChecks(output: string, paths: string[]): SelectedCheck[] {
  let report: unknown
  try {
    report = JSON.parse(output)
  } catch {
    throw new Error(`Impact selection did not return JSON: ${output.slice(0, 1000)}`)
  }
  if (!report || typeof report !== 'object') throw new Error('Impact selection returned no report')
  const value = report as Record<string, unknown>
  if (
    !Array.isArray(value.changed_files) ||
    !Array.isArray(value.checks) ||
    !Array.isArray(value.warnings) ||
    typeof value.fallback_triggered !== 'boolean'
  ) {
    throw new Error('Impact selection returned an unknown report shape')
  }
  const reportedPaths: unknown[] = value.changed_files
  if (
    reportedPaths.some(path => typeof path !== 'string') ||
    reportedPaths.length !== paths.length ||
    paths.some(path => !reportedPaths.includes(path))
  ) {
    throw new Error('Impact selection did not account for every changed file')
  }
  if (value.warnings.length > 0) {
    throw new Error(
      `Impact selection warnings (including missed or unknown gates): ${JSON.stringify(value.warnings)}`,
    )
  }
  if (value.fallback_triggered) {
    throw new Error('Impact selection fell back; the selected gates are unknown')
  }
  if (value.empty_result || (paths.length > 0 && value.checks.length === 0)) {
    throw new Error(
      `Impact selection missed all checks: ${JSON.stringify(value.empty_result ?? paths)}`,
    )
  }
  const names = new Set<string>()
  return value.checks.map((check: unknown) => {
    if (!check || typeof check !== 'object')
      throw new Error(`Unknown selected check: ${JSON.stringify(check)}`)
    const selected = check as SelectedCheck
    if (
      typeof selected.name !== 'string' ||
      !selected.name ||
      selected.kind !== 'generic' ||
      !Array.isArray(selected.command) ||
      selected.command.length === 0 ||
      selected.command.some(part => typeof part !== 'string' || !part) ||
      (selected.files !== undefined &&
        (!Array.isArray(selected.files) ||
          selected.files.some(file => typeof file !== 'string' || !file))) ||
      names.has(selected.name)
    ) {
      throw new Error(`Unknown or duplicate selected check: ${JSON.stringify(check)}`)
    }
    names.add(selected.name)
    return selected
  })
}

function selectChecks(manifest: string, paths: string[]): SelectedCheck[] {
  const output = run(
    'pnpm',
    [
      'exec',
      'no-mistakes',
      'impacted-checks',
      '--generic-only',
      '--changed-files',
      manifest,
      '--format',
      'json',
    ],
    true,
  )
  return parseSelectedChecks(output, paths)
}

function main(): void {
  if (process.argv.length !== 2) throw new Error('Usage: pnpm run impacted-checks')
  // CI compiles this untracked local catalog before its static checks. Keep selection in sync.
  run('node', ['dev/localization/local-catalog.mts'])
  const base = run('git', ['merge-base', 'origin/main', 'HEAD'], true).trim()
  if (!base) throw new Error('Could not find the merge base with origin/main')
  const paths = changedPaths(base)
  if (paths.length === 0) {
    process.stdout.write('No changed files against origin/main.\n')
    return
  }
  const temporary = mkdtempSync(join(tmpdir(), 'voucha-impacted-checks-'))
  try {
    const manifest = join(temporary, 'changed-files.txt')
    const writeManifest = () => {
      if (paths.some(path => path.includes('\n'))) {
        throw new Error('Changed path contains a newline and cannot be written to the manifest')
      }
      writeFileSync(manifest, `${paths.join('\n')}\n`)
    }
    writeManifest()
    const checks = selectChecks(manifest, paths)
    const failures: string[] = []
    for (const check of checks) {
      process.stdout.write(`\nRunning selected check: ${check.name}\n`)
      try {
        run(check.command[0]!, check.command.slice(1))
      } catch (err) {
        failures.push(`${check.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (failures.length > 0) throw new Error(`Selected checks failed:\n${failures.join('\n')}`)
    process.stdout.write(`Passed ${checks.length} selected checks.\n`)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  }
}
