// Type/helper scaffolding for the Vitest project ownership model — split out of
// project-ownership.mts to keep that file's `VITEST_OWNERSHIP` data array under the line cap.
// See project-ownership.mts for the single-source-of-truth data array and its consumers.
export type VitestInvocationForm =
  | 'literal'
  | 'tooling-registry'
  | 'portability-group'
  | 'storybook'

export interface VitestProjectOwnership {
  readonly project: string
  // The VITEST.md "Credential requirement" column text, e.g. 'None', 'OPENAI_API_KEY'.
  readonly credential: string
  // Only web-storybook-browser sets this today: it is the one project whose --project token is
  // never literal text in a workflow YAML `run:` line — it's assembled at runtime by
  // ci/storybook-browser-runner-env.mts's vitestArgs(), so the workflow-command parity test
  // must resolve it through that script instead of scanning `storybook.yml`.
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
  // True only if this job's ci.yml caller must stay area-gated on detect-changes without the
  // `skip-test-<job>` guard — an always-run non-Vitest duty that must survive an empty Vitest
  // selection. Everything else is pure Vitest and safely selection-skippable.
  readonly sideDuty: boolean
  readonly invocation: VitestInvocationForm
  readonly projects: readonly VitestProjectOwnership[]
}

export const NONE = 'None'

export function noCredential(projects: readonly string[]): VitestProjectOwnership[] {
  return projects.map(project => ({ project, credential: NONE }))
}
