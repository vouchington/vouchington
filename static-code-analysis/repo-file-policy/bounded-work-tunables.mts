import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { WorkTunableAllowEntry } from './bounded-work-tunables-allowlist.mts'

const toolRoot = resolve(import.meta.dirname, '../..')
const rules = ['bounded-work-literal', 'bounded-work-env'] as const
// This bounds CLI argument bytes; it is not a production work budget.
const scannerFileChunk = 500

type Finding = WorkTunableAllowEntry & { line: number }

export function checkBoundedWorkTunables(
  repoRoot: string,
  trackedFiles: readonly string[],
  allowlist: readonly WorkTunableAllowEntry[],
): string[] {
  const errors: string[] = []
  const allowed = new Map<string, WorkTunableAllowEntry>()
  for (const entry of allowlist) {
    const key = findingKey(entry)
    if (!entry.reason.trim()) {
      errors.push(`::error file=${entry.file}::work tunable allow entry requires a reason`)
      continue
    }
    if (allowed.has(key))
      errors.push(`::error file=${entry.file}::duplicate work tunable allow entry`)
    allowed.set(key, entry)
  }
  const files = trackedFiles.filter(
    file =>
      file.startsWith('backend/') &&
      /\.(?:mts|ts|cts|tsx)$/.test(file) &&
      !/(?:^|\/)(?:test-helpers|scripts|__tests__|node_modules)(?:\/|$)/.test(file) &&
      !/\.(?:test|spec)\./.test(file) &&
      existsSync(join(repoRoot, file)),
  )
  const observed = new Set<string>()
  try {
    for (const rule of rules) {
      for (let offset = 0; offset < files.length; offset += scannerFileChunk) {
        for (const finding of scan(
          repoRoot,
          rule,
          files.slice(offset, offset + scannerFileChunk),
        )) {
          const key = findingKey(finding)
          observed.add(key)
          if (allowed.has(key)) continue
          errors.push(
            `::error file=${finding.file},line=${finding.line}::${finding.identifier} ` +
              `must use an owning DynamicConfig runtime bound (${finding.ruleId}); ` +
              'external contracts require an exact reasoned allow entry',
          )
        }
      }
    }
  } catch (err) {
    errors.push(`::error::bounded work tunables scanner failed: ${String(err)}`)
    return errors
  }
  for (const [key, entry] of allowed) {
    if (!observed.has(key))
      errors.push(
        `::error file=${entry.file}::stale work tunable allow entry for ${entry.identifier}=${entry.value}`,
      )
  }
  return errors
}

function findingKey(entry: WorkTunableAllowEntry): string {
  return JSON.stringify([entry.file, entry.ruleId, entry.identifier, entry.value])
}

function scan(repoRoot: string, rule: (typeof rules)[number], files: string[]): Finding[] {
  const result = spawnSync(
    join(toolRoot, 'node_modules/.bin/ast-grep'),
    [
      'scan',
      '--config',
      join(toolRoot, 'sgconfig.yml'),
      '--rule',
      join(import.meta.dirname, `${rule}.yml`),
      '--json=stream',
      '--include-metadata',
      ...files,
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  if (result.error) throw result.error
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`ast-grep exited ${result.status}: ${result.stderr.trim()}`)
  }
  const rows = result.stdout.split('\n').filter(line => line.trim())
  if (result.status === 1 && rows.length === 0)
    throw new Error('ast-grep failed without diagnostics')
  return rows.map(line => {
    const finding = decodeDiagnostic(repoRoot, rule, JSON.parse(line) as unknown)
    if (!files.includes(finding.file))
      throw new Error('Scanner diagnostic is outside tracked inputs')
    return finding
  })
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid scanner diagnostic object')
  return value as Record<string, unknown>
}

function decodeDiagnostic(repoRoot: string, rule: string, input: unknown): Finding {
  const row = object(input)
  const captures = object(object(row.metaVariables).single)
  const name = object(captures.NAME ?? captures.ENV_KEY).text
  const value = rule === 'bounded-work-literal' ? object(captures.VALUE).text : name
  const line = object(object(row.range).start).line
  if (
    typeof row.file !== 'string' ||
    row.ruleId !== rule ||
    typeof name !== 'string' ||
    typeof value !== 'string' ||
    typeof line !== 'number' ||
    !Number.isSafeInteger(line) ||
    line < 0
  ) {
    throw new Error('Invalid scanner diagnostic fields')
  }
  const file = relative(repoRoot, resolve(repoRoot, row.file)).replaceAll('\\', '/')
  if (file.startsWith('../')) throw new Error('Scanner diagnostic escaped repository')
  return {
    file,
    ruleId: rule,
    identifier: name.replace(/^['"]|['"]$/g, ''),
    value,
    line: line + 1,
    reason: '',
  }
}
