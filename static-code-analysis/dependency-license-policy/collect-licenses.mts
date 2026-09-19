import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

export interface LicenseReportEntry {
  name: string
  versions?: string[]
}

/** Shape of `pnpm licenses list --json`: license expression -> package entries. */
export type LicenseReport = Record<string, LicenseReportEntry[]>

export type LicenseListExecutor = (
  command: string,
  args: string[],
  options: { cwd: string; encoding: 'utf8' },
) => { error?: Error; status: number | null; stderr: string; stdout: string }

type PlatformKey = 'cpu' | 'libc' | 'os'
type TextFileReader = (path: string, encoding: 'utf8') => string

const PLATFORM_KEYS: readonly PlatformKey[] = ['os', 'cpu', 'libc']

function parseYamlObject(source: string, path: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = parseYaml(source)
  } catch (error) {
    throw new Error(
      `failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected ${path} to contain a YAML object`)
  }
  return parsed as Record<string, unknown>
}

function getStringList(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`expected ${path} to be an array of strings`)
  }
  return value
}

function parseLicenseReport(value: unknown): LicenseReport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('expected a JSON object keyed by license expression')
  }

  const report: LicenseReport = {}
  for (const [licenseExpression, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) {
      throw new Error(`expected license group ${JSON.stringify(licenseExpression)} to be an array`)
    }
    report[licenseExpression] = entries.map((entry, index) => {
      const path = `license group ${JSON.stringify(licenseExpression)} entry ${String(index)}`
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error(`expected ${path} to be an object`)
      }
      const { name, versions } = entry as Record<string, unknown>
      if (typeof name !== 'string') {
        throw new Error(`expected ${path}.name to be a string`)
      }
      if (versions === undefined) return { name }
      return { name, versions: getStringList(versions, `${path}.versions`) }
    })
  }
  return report
}

/**
 * Pnpm's license scanner walks the lockfile but omits a package when its
 * platform selector is not installable on the runner. Requiring the workspace
 * configuration to cover every lockfile platform makes pnpm install those
 * manifests and lets the scanner audit the complete graph.
 */
export function validateSupportedArchitectureCoverage(
  lockfileSource: string,
  workspaceSource: string,
  paths: { lockfile: string; workspace: string },
): void {
  const lockfile = parseYamlObject(lockfileSource, paths.lockfile)
  const workspace = parseYamlObject(workspaceSource, paths.workspace)
  const packages = lockfile.packages
  if (typeof packages !== 'object' || packages === null || Array.isArray(packages)) {
    throw new Error(`expected ${paths.lockfile} to contain a packages object`)
  }
  const supportedArchitectures = workspace.supportedArchitectures
  if (
    typeof supportedArchitectures !== 'object' ||
    supportedArchitectures === null ||
    Array.isArray(supportedArchitectures)
  ) {
    throw new Error(`expected ${paths.workspace} to contain a supportedArchitectures object`)
  }

  for (const key of PLATFORM_KEYS) {
    const configuredValues = new Set(
      getStringList(
        (supportedArchitectures as Record<string, unknown>)[key],
        `${paths.workspace} supportedArchitectures.${key}`,
      ),
    )
    const requiredValues = new Set<string>()
    for (const snapshot of Object.values(packages as Record<string, unknown>)) {
      if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) continue
      const value = (snapshot as Record<string, unknown>)[key]
      if (value === undefined) continue
      for (const platform of getStringList(value, `${paths.lockfile} packages.*.${key}`)) {
        requiredValues.add(platform)
      }
    }
    const missingValues = [...requiredValues].filter(value => !configuredValues.has(value)).sort()
    if (missingValues.length > 0) {
      throw new Error(
        `${paths.workspace} supportedArchitectures.${key} is missing lockfile values: ${missingValues.join(', ')}`,
      )
    }
  }
}

/**
 * Runs `pnpm licenses list --json` over the *whole* dependency graph —
 * deliberately without `--prod`. `--prod` misclassifies transitively
 * dev-only packages as production in this pnpm monorepo (verified: every
 * `pnpm why lightningcss --recursive` path bottoms out in a devDependency,
 * yet `--prod` still reports it), so scanning everything and treating
 * dev/prod alike is simpler and cannot under-scan.
 */
export function collectLicenseReport(
  repoRoot: string,
  execute: LicenseListExecutor = spawnSync,
  readFile: TextFileReader = readFileSync,
): LicenseReport {
  const lockfilePath = join(repoRoot, 'pnpm-lock.yaml')
  const workspacePath = join(repoRoot, 'pnpm-workspace.yaml')
  validateSupportedArchitectureCoverage(
    readFile(lockfilePath, 'utf8'),
    readFile(workspacePath, 'utf8'),
    { lockfile: lockfilePath, workspace: workspacePath },
  )
  const result = execute('pnpm', ['licenses', 'list', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `pnpm licenses list --json exited with status ${String(result.status)}: ${result.stderr.trim()}`,
    )
  }

  try {
    const parsed: unknown = JSON.parse(result.stdout)
    return parseLicenseReport(parsed)
  } catch (error) {
    throw new Error(
      `pnpm licenses list --json produced unparseable output: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    )
  }
}
