import type { ResolveCheckBatchResult } from 'no-mistakes'

export type UnresolvedImportExclusion = {
  file: string
  specifier: string
  reason: string
}

/** Reviewed exceptions only. Each entry needs a reason; keep empty until one is justified. */
export const UNRESOLVED_IMPORT_EXCLUSIONS: readonly UnresolvedImportExclusion[] = []

export function asResolveCheckBatch(result: unknown): ResolveCheckBatchResult | undefined {
  if (result === undefined || result === null || typeof result !== 'object') return undefined
  if (!('results' in result) || !Array.isArray(result.results)) return undefined
  return result as ResolveCheckBatchResult
}

export function isComputedImportExcluded(
  file: string,
  exclusions: readonly UnresolvedImportExclusion[] = UNRESOLVED_IMPORT_EXCLUSIONS,
): boolean {
  return exclusions.some(entry => entry.file === file && entry.specifier === 'computed')
}

export function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@/')
}

export function unresolvedImportFailures(
  result: unknown,
  exclusions: readonly UnresolvedImportExclusion[] = UNRESOLVED_IMPORT_EXCLUSIONS,
): string[] {
  const batch = asResolveCheckBatch(result)
  if (batch === undefined) return ['resolveCheck report missing']
  const failures: string[] = []
  for (const fileResult of batch.results) {
    for (const imported of fileResult.imports) {
      if (imported.status === 'external' || imported.status === 'resolved') continue
      if (!isLocalSpecifier(imported.specifier)) continue
      if (
        exclusions.some(
          entry => entry.file === fileResult.file && entry.specifier === imported.specifier,
        )
      ) {
        continue
      }
      failures.push(`${fileResult.file}: ${imported.specifier} (${imported.status})`)
    }
  }
  return failures
}

export function assertResolvedImports(
  result: unknown,
  exclusions: readonly UnresolvedImportExclusion[] = UNRESOLVED_IMPORT_EXCLUSIONS,
): void {
  const failures = unresolvedImportFailures(result, exclusions)
  if (failures.length === 0) return
  throw new Error(`Unresolved reachable imports:\n${failures.join('\n')}`)
}
