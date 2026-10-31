import {
  ENV_VAR_CONTRACT,
  collectTypedEnvContractEntries,
  collectTypedEnvVarConstants,
} from '../../ts-shared/env-contract/index.mts'

import type { TypedEnvContractEntry } from './types.mts'

export async function loadTypedEnvContractData(): Promise<{
  entries: TypedEnvContractEntry[]
  constants: Map<string, string>
}> {
  return {
    entries: publishedTypedEnvContractEntries(),
    constants: new Map(Object.entries(collectTypedEnvVarConstants())),
  }
}

function publishedTypedEnvContractEntries(): TypedEnvContractEntry[] {
  // envContractManifest follows ENV_VAR_CONTRACT in order. Each row reads both.
  const manifest = collectTypedEnvContractEntries()
  return ENV_VAR_CONTRACT.map((contractEntry, index) => {
    const manifestEntry = manifest[index]
    return {
      name: contractEntry.name,
      contractKey: manifestEntry.contractKey,
      sourceOfTruth: contractEntry.sourceOfTruth,
      sensitivity: contractEntry.sensitivity,
      runtimeSurfaces: [...manifestEntry.runtimeSurfaces],
    }
  })
}
