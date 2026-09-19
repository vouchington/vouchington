import { spawnSync } from 'node:child_process'

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
): LicenseReport {
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
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('expected a JSON object keyed by license expression')
    }
    return parsed as LicenseReport
  } catch (error) {
    throw new Error(
      `pnpm licenses list --json produced unparseable output: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    )
  }
}
