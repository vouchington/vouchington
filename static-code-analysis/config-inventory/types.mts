export type EnvClassification =
  | 'build-time'
  | 'ci-test-control'
  | 'credential-secret'
  | 'deploy-only'
  | 'dynamic-config-candidate'
  | 'feature-opt-in'
  | 'local-startup-required'
  | 'package-manager-gate'
  | 'review-required'

export interface EnvVarInventoryRow {
  name: string
  classifications: EnvClassification[]
  reviewReason: string | null
  contractKey: string | null
  contractKeys: string[]
  sourceOfTruth: string | null
  sensitivity: string | null
  runtimeSurfaces: string[]
  readers: string[]
  localSetup: string[]
  docs: string[]
  deployment: string[]
  dockerBuildArgs: string[]
  workflows: string[]
  packageGates: string[]
}

export interface DynamicConfigInventoryRow {
  namespace: string
  definitionFiles: string[]
  registryFiles: string[]
}

export interface PackageGateInventoryRow {
  name: string
  values: string[]
  files: string[]
}

export interface ConfigInventory {
  envVars: EnvVarInventoryRow[]
  dynamicConfigs: DynamicConfigInventoryRow[]
  packageGates: PackageGateInventoryRow[]
}

export interface EnvVarAccumulator {
  name: string
  contractKey: string | null
  contractKeys: Set<string>
  sourceOfTruth: string | null
  sensitivity: string | null
  runtimeSurfaces: Set<string>
  readers: Set<string>
  localSetup: Set<string>
  docs: Set<string>
  deployment: Set<string>
  dockerBuildArgs: Set<string>
  workflows: Set<string>
  packageGates: Set<string>
}

export type SourceBucket = keyof Omit<
  EnvVarAccumulator,
  'name' | 'contractKey' | 'contractKeys' | 'sourceOfTruth' | 'sensitivity' | 'runtimeSurfaces'
>

export interface EnvVarReferenceMatcher {
  name: string
  pattern: RegExp
}

export interface TypedEnvContractEntry {
  name: string
  contractKey?: string
  sourceOfTruth?: string
  sensitivity?: string
  runtimeSurfaces?: string[]
}
