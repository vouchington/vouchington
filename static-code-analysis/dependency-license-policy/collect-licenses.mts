import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { parseLicenseReport, type LicenseReport } from './parse-license-report.mts'

export type { LicenseReport, LicenseReportEntry } from './parse-license-report.mts'

export type PnpmExecutor = (
  command: string,
  args: string[],
  options: { cwd: string; encoding: 'utf8' },
) => { error?: Error; status: number | null; stderr: string; stdout: string }

function commandFailureOutput(result: { stderr: string; stdout: string }): string {
  return result.stderr.trim() || result.stdout.trim()
}

type PlatformKey = 'cpu' | 'libc' | 'os'
type TextFileReader = (path: string, encoding: 'utf8') => string

interface LicenseAuditWorkspace {
  cleanup: () => void
  cwd: string
}

type LicenseAuditWorkspacePreparer = (
  repoRoot: string,
  lockfileSource: string,
  workspaceSource: string,
) => LicenseAuditWorkspace

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
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`expected ${path} to be a string or an array of strings`)
  }
  return value
}

export function renderLicenseAuditWorkspace(
  lockfileSource: string,
  workspaceSource: string,
  paths: { lockfile: string; workspace: string },
): string {
  const lockfile = parseYamlObject(lockfileSource, paths.lockfile)
  const workspace = parseYamlObject(workspaceSource, paths.workspace)
  const packages = lockfile.packages
  if (typeof packages !== 'object' || packages === null || Array.isArray(packages)) {
    throw new Error(`expected ${paths.lockfile} to contain a packages object`)
  }

  const supportedArchitectures: Record<PlatformKey, string[]> = {
    cpu: ['current'],
    libc: ['current'],
    os: ['current'],
  }
  for (const key of PLATFORM_KEYS) {
    const requiredValues = new Set<string>()
    for (const snapshot of Object.values(packages as Record<string, unknown>)) {
      if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) continue
      const value = (snapshot as Record<string, unknown>)[key]
      if (value === undefined) continue
      for (const platform of getStringList(value, `${paths.lockfile} packages.*.${key}`)) {
        requiredValues.add(platform)
      }
    }
    supportedArchitectures[key].push(
      ...[...requiredValues].filter(value => value !== 'current').sort(),
    )
  }

  return stringifyYaml({ ...workspace, packages: [], supportedArchitectures })
}

/**
 * Gives `pnpm licenses list` a command-scoped view of every lockfile platform
 * without making normal workspace installs materialize every native package.
 */
function prepareLicenseAuditWorkspace(
  repoRoot: string,
  lockfileSource: string,
  workspaceSource: string,
): LicenseAuditWorkspace {
  const auditRoot = mkdtempSync(join(tmpdir(), 'voucha-license-audit-'))
  try {
    copyFileSync(join(repoRoot, 'package.json'), join(auditRoot, 'package.json'))
    copyFileSync(join(repoRoot, 'pnpm-lock.yaml'), join(auditRoot, 'pnpm-lock.yaml'))
    copyFileSync(join(repoRoot, '.npmrc'), join(auditRoot, '.npmrc'))
    writeFileSync(
      join(auditRoot, 'pnpm-workspace.yaml'),
      renderLicenseAuditWorkspace(lockfileSource, workspaceSource, {
        lockfile: join(repoRoot, 'pnpm-lock.yaml'),
        workspace: join(repoRoot, 'pnpm-workspace.yaml'),
      }),
      'utf8',
    )
  } catch (error) {
    rmSync(auditRoot, { force: true, recursive: true })
    throw error
  }
  return {
    cwd: auditRoot,
    cleanup: () => rmSync(auditRoot, { force: true, recursive: true }),
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
  execute: PnpmExecutor = spawnSync,
  readFile: TextFileReader = readFileSync,
  prepareWorkspace: LicenseAuditWorkspacePreparer = prepareLicenseAuditWorkspace,
): LicenseReport {
  const lockfilePath = join(repoRoot, 'pnpm-lock.yaml')
  const workspacePath = join(repoRoot, 'pnpm-workspace.yaml')
  const auditWorkspace = prepareWorkspace(
    repoRoot,
    readFile(lockfilePath, 'utf8'),
    readFile(workspacePath, 'utf8'),
  )
  try {
    const storeDir = join(auditWorkspace.cwd, '.pnpm-store')
    const storeConfig = `--config.store-dir=${storeDir}`
    const fetchResult = execute(
      'pnpm',
      [storeConfig, '--config.force=true', 'fetch', '--ignore-scripts'],
      {
        cwd: auditWorkspace.cwd,
        encoding: 'utf8',
      },
    )
    if (fetchResult.error) throw fetchResult.error
    if (fetchResult.status !== 0) {
      throw new Error(
        `pnpm fetch exited with status ${String(fetchResult.status)}: ${commandFailureOutput(fetchResult)}`,
      )
    }

    const result = execute('pnpm', [storeConfig, 'licenses', 'list', '--json'], {
      cwd: auditWorkspace.cwd,
      encoding: 'utf8',
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(
        `pnpm licenses list --json exited with status ${String(result.status)}: ${commandFailureOutput(result)}`,
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
  } finally {
    auditWorkspace.cleanup()
  }
}
