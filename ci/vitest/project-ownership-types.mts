// Type/helper scaffolding for the Vitest project ownership model — split out of
// project-ownership.mts to keep that file's `VITEST_OWNERSHIP` data array under the line cap.
// See project-ownership.mts for the single-source-of-truth data array and its consumers.
type VitestInvocationForm = 'literal' | 'tooling-registry' | 'portability-group' | 'storybook'

export interface VitestProjectOwnership {
  readonly project: string
  // The credential requirement text, e.g. 'None', 'OPENAI_API_KEY'.
  readonly credential: string
  // Marks the project supervised by the published Storybook browser runner.
  readonly browserRunner?: true
}

export type VitestShardPolicy =
  | {
      readonly mode: 'file-count'
      readonly reportPrefix: string
      readonly filesPerShard: number
    }
  | {
      readonly mode: 'fixed'
      readonly reportPrefix: string
      readonly shards: number
    }

export interface VitestJobOwnership {
  readonly orchestratorJob: string
  readonly workflow: string
  readonly jobLabel: string
  // Shard report identity and matrix sizing policy. Omit for jobs that always run in one process.
  readonly sharding?: VitestShardPolicy
  readonly invocation: VitestInvocationForm
  readonly projects: readonly VitestProjectOwnership[]
}

export const NONE = 'None'

export function noCredential(projects: readonly string[]): VitestProjectOwnership[] {
  return projects.map(project => ({ project, credential: NONE }))
}
