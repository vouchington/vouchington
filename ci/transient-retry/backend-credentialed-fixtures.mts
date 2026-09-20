import { backendCredentialedVitestCommandMarkers } from './backend-credentialed-log-fingerprints.mts'

/**
 * Shared synthetic-log builders for credentialed-provider Vitest projects. Callers pass the
 * project/path in — this module holds no repo-path literal of its own — so a fixture can no
 * longer agree with a broken matcher by construction (see #10806/#10825), and this file carries
 * zero literals for `repo-owned-literal-freshness.test.mts`'s completeness scanner to police.
 *
 * Built by joining the same markers `hasBackendCredentialedProviderSmokeTestEnvelope` requires,
 * rather than a hand-typed second copy of the real `run:` line — so this fixture can't silently
 * drift out of agreement with the matcher it feeds (the exact bug class this plan closes).
 */
export const backendCredentialedVitestCommandLine =
  backendCredentialedVitestCommandMarkers.join(' ')

export interface BackendCredentialedFailureBlockOptions {
  project: string
  path: string
  titlePath?: string
  markerLines: readonly string[]
}

export function buildBackendCredentialedFailureBlock(
  options: BackendCredentialedFailureBlockOptions,
): string {
  const { project, path, titlePath, markerLines } = options
  const failLine = titlePath
    ? `FAIL  ${project}  ${path} > ${titlePath}`
    : `FAIL  ${project}  ${path}`
  return [failLine, ...markerLines].join('\n')
}

export function buildBackendCredentialedFailureLog(
  blocks: readonly BackendCredentialedFailureBlockOptions[],
  extraLines: readonly string[] = [],
): string {
  return [
    backendCredentialedVitestCommandLine,
    ...blocks.map(buildBackendCredentialedFailureBlock),
    ...extraLines,
  ].join('\n')
}
