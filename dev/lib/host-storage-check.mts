export const HOST_STORAGE_MINIMUM_FREE_BYTES = 5n * 1024n ** 3n

export interface HostStorageProbeDependencies {
  realpath(path: string): Promise<string>
  stat(path: string): Promise<{ dev: bigint }>
  statfs(path: string): Promise<{ bavail: bigint; bsize: bigint }>
}

export type StorageCandidate = {
  label: string
  path: string
  recovery: string
  required: boolean
}

export type HostStorageIssue = {
  label: string
  message: string
  severity: 'error' | 'warning'
  type: 'low-space' | 'probe' | 'resolution'
}

export type HostStorageFilesystem = {
  availableBytes: bigint
  device: bigint
  labels: string[]
  path: string
}

export type HostStorageResult = {
  filesystems: HostStorageFilesystem[]
  issues: HostStorageIssue[]
  ok: boolean
}

type ResolvedCandidate = StorageCandidate & {
  device: bigint
  resolvedPath: string
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function formatGiB(bytes: bigint): string {
  const hundredths = (bytes * 100n) / 1024n ** 3n
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')} GiB`
}

export function makeResolutionIssue(candidate: StorageCandidate, detail: string): HostStorageIssue {
  return {
    label: candidate.label,
    message: `Could not resolve host storage for ${candidate.label} (${shellQuote(candidate.path)}): ${detail}. ${candidate.recovery}`,
    severity: candidate.required ? 'error' : 'warning',
    type: 'resolution',
  }
}

function makeProbeIssue(candidate: StorageCandidate, detail: string): HostStorageIssue {
  return {
    label: candidate.label,
    message: `Could not measure free host storage for ${candidate.label} (${shellQuote(candidate.path)}): ${detail}. Inspect it with: df -h ${shellQuote(candidate.path)}. ${candidate.recovery}`,
    severity: candidate.required ? 'error' : 'warning',
    type: 'probe',
  }
}

function makeLowSpaceIssue(filesystem: HostStorageFilesystem, recovery: string): HostStorageIssue {
  const labels = filesystem.labels.join(', ')
  return {
    label: filesystem.labels[0] ?? 'host storage',
    message: `Insufficient host storage for ${labels}: ${formatGiB(filesystem.availableBytes)} free; ${formatGiB(HOST_STORAGE_MINIMUM_FREE_BYTES)} required. Inspect it with: df -h ${shellQuote(filesystem.path)}. ${recovery}`,
    severity: 'error',
    type: 'low-space',
  }
}

async function resolveCandidate(
  candidate: StorageCandidate,
  dependencies: HostStorageProbeDependencies,
): Promise<{ issue?: HostStorageIssue; resolved?: ResolvedCandidate }> {
  let resolvedPath: string
  try {
    resolvedPath = await dependencies.realpath(candidate.path)
  } catch (error) {
    return { issue: makeResolutionIssue(candidate, errorMessage(error)) }
  }
  try {
    const pathStat = await dependencies.stat(resolvedPath)
    return { resolved: { ...candidate, device: pathStat.dev, resolvedPath } }
  } catch (error) {
    return { issue: makeProbeIssue({ ...candidate, path: resolvedPath }, errorMessage(error)) }
  }
}

async function probeFilesystem(
  device: bigint,
  candidates: ResolvedCandidate[],
  dependencies: HostStorageProbeDependencies,
): Promise<{ filesystem?: HostStorageFilesystem; issues: HostStorageIssue[] }> {
  const representative = candidates[0]
  if (!representative) return { issues: [] }

  let availableBytes: bigint
  try {
    const filesystem = await dependencies.statfs(representative.resolvedPath)
    availableBytes = filesystem.bavail * filesystem.bsize
  } catch (error) {
    const required = candidates.some(candidate => candidate.required)
    return {
      issues: [
        makeProbeIssue(
          {
            label: candidates.map(candidate => candidate.label).join(', '),
            path: representative.resolvedPath,
            recovery: required
              ? 'Free host storage or repair access to this filesystem, then retry.'
              : representative.recovery,
            required,
          },
          errorMessage(error),
        ),
      ],
    }
  }

  const filesystem = {
    availableBytes,
    device,
    labels: candidates.map(candidate => candidate.label),
    path: representative.resolvedPath,
  }
  const issues =
    availableBytes < HOST_STORAGE_MINIMUM_FREE_BYTES
      ? [
          makeLowSpaceIssue(
            filesystem,
            [...new Set(candidates.map(candidate => candidate.recovery))].join(' '),
          ),
        ]
      : []
  return { filesystem, issues }
}

export async function probeHostStorage(
  candidates: StorageCandidate[],
  dependencies: HostStorageProbeDependencies,
): Promise<HostStorageResult> {
  const resolutions = await Promise.all(
    candidates.map(candidate => resolveCandidate(candidate, dependencies)),
  )
  const issues = resolutions.flatMap(result => (result.issue ? [result.issue] : []))
  const candidatesByDevice = new Map<bigint, ResolvedCandidate[]>()
  for (const resolved of resolutions.flatMap(result =>
    result.resolved ? [result.resolved] : [],
  )) {
    const deviceCandidates = candidatesByDevice.get(resolved.device) ?? []
    deviceCandidates.push(resolved)
    candidatesByDevice.set(resolved.device, deviceCandidates)
  }

  const probes = await Promise.all(
    [...candidatesByDevice].map(([device, grouped]) =>
      probeFilesystem(device, grouped, dependencies),
    ),
  )
  issues.push(...probes.flatMap(probe => probe.issues))
  return {
    filesystems: probes.flatMap(probe => (probe.filesystem ? [probe.filesystem] : [])),
    issues,
    ok: !issues.some(issue => issue.severity === 'error'),
  }
}
