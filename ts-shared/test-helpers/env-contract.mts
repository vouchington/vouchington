import { ENV_VAR_CONTRACT } from '../env-contract/index.mts'

type EnvVarContract = (typeof ENV_VAR_CONTRACT)[number]
type EnvVarSensitivity = EnvVarContract['sensitivity']
type EnvVarSurface = EnvVarContract['surfaces'][number]

export function envNamesForSurface(surface: EnvVarSurface): readonly string[] {
  const names: string[] = []
  for (const entry of ENV_VAR_CONTRACT) {
    if (entry.surfaces.includes(surface)) names.push(entry.name)
  }
  return names
}

export function envContractsByName(): ReadonlyMap<string, readonly EnvVarContract[]> {
  return Map.groupBy(ENV_VAR_CONTRACT, entry => entry.name)
}

export function knownPublicEnvNames(): readonly string[] {
  return namesBySensitivity('public')
}

export function knownSecretEnvNames(): readonly string[] {
  return namesBySensitivity('secret')
}

function namesBySensitivity(sensitivity: EnvVarSensitivity): readonly string[] {
  const names = new Set<string>()
  for (const entry of ENV_VAR_CONTRACT) {
    if (entry.sensitivity === sensitivity) names.add(entry.name)
  }
  return [...names].toSorted((a, b) => a.localeCompare(b))
}
