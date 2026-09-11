import type { TransientRetryRule } from '../../ci/transient-retry/types.mts'
import type { ArtifactEdge } from 'no-mistakes'

export type EdgeRule = readonly [from: string, to: string]
export type ArtifactEdgeRule = Readonly<{
  from: string
  to: string
  name: string
  match?: ArtifactEdge['match']
}>
export type StepOrderRule = {
  jobId: string
  steps: readonly StepSelector[]
}
export type StepSelector = { id?: string; uses?: string; name?: string }
export type TargetedRerunPolicy = {
  innerTargetJob: string
  innerDownstreamJobs: readonly string[]
  outerCallers: Readonly<Record<string, readonly string[]>>
} & (
  | { rerunTargetJobName: string; rerunTargetJobNameFamily?: never }
  | { rerunTargetJobName?: never; rerunTargetJobNameFamily: string }
)

export type WorkflowTopologyPolicy = {
  jobInventory: Readonly<Record<string, readonly string[]>>
  unlockedWorkflowReasons: Readonly<Record<string, string>>
  requiredJobs: readonly string[]
  forbiddenJobs: readonly string[]
  requiredDirectEdges: readonly EdgeRule[]
  forbiddenDirectEdges: readonly EdgeRule[]
  requiredTransitiveEdges: readonly EdgeRule[]
  forbiddenTransitiveEdges: readonly EdgeRule[]
  requiredArtifactEdges: readonly ArtifactEdgeRule[]
  exactFanIns: Readonly<Record<string, readonly string[]>>
  exactCallerJobs: Readonly<Record<string, readonly string[]>>
  stepOrders: readonly StepOrderRule[]
  targetedReruns: Readonly<Record<string, TargetedRerunPolicy>>
}

export type TargetedRule = Pick<TransientRetryRule, 'id' | 'rerunTarget'>
