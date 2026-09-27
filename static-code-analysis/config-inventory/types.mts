import type {
  DynamicConfigInventoryRow,
  EnvVarInventoryRow as PublishedEnvVarInventoryRow,
  PackageGateInventoryRow,
} from 'vouchington-tooling/config-inventory'

export type {
  DynamicConfigInventoryRow,
  DynamicConfigReference,
  PackageGateInventoryRow,
  SourceBucket,
  TypedEnvContractEntry,
} from 'vouchington-tooling/config-inventory'

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

export interface EnvVarInventoryRow extends Omit<PublishedEnvVarInventoryRow, 'classifications'> {
  classifications: EnvClassification[]
}

export interface ConfigInventory {
  envVars: EnvVarInventoryRow[]
  dynamicConfigs: DynamicConfigInventoryRow[]
  packageGates: PackageGateInventoryRow[]
}
