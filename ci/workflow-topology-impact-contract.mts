import type { CiTopologyImpactOptions } from 'no-mistakes'

export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml'

export type CiTopologyImpactRoutingOptions = {
  changedPaths: readonly string[]
  input: CiTopologyImpactOptions
  knownRootJobIds: ReadonlySet<string>
}
