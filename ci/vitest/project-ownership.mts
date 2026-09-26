// Canonical Vitest project ownership model. Every registered Vitest project must appear in
// exactly one job's `projects` list here. This is the single source of truth that:
//   - `ci/vitest/project-ownership-registry.mts` derives the project-to-job map and shard policies
//     from it (mirrors the tooling-project-policies.mts / tooling-project-registry.mts split: this
//     file is raw data, that one is derived collections).
//   - `.github/workflows/vitest-project-ownership.test.mts` validates against the real
//     `--project` commands in `.github/workflows/tests-*.yml` / `storybook.yml`.
//   - `ci/vitest/generate-ownership-table.mts` renders into `.github/workflows/VITEST.md`.
// To add, move, rename, or remove a project: edit the entry below, then run
// `node ci/vitest/generate-ownership-table.mts` to refresh VITEST.md. The three consumers above
// enforce that every surface stays in sync — see VITEST.md's "Single source of truth" section.
import { VITEST_PROJECT_GROUPS } from '../run-vitest-project-group.mts'
import {
  dedicatedToolingWorkflowProjectNames,
  toolingWorkflowProjectNames,
} from '../../test-helpers/vitest-config/tooling-project-registry.mts'
import { NONE, noCredential, type VitestJobOwnership } from './project-ownership-types.mts'

export const VITEST_OWNERSHIP: readonly VitestJobOwnership[] = [
  {
    orchestratorJob: 'test-ts-shared',
    workflow: 'tests-ts-shared.yml',
    jobLabel: 'ts-shared',
    invocation: 'literal',
    projects: noCredential(['ts-shared']),
  },
  {
    orchestratorJob: 'test-tooling',
    workflow: 'tests-tooling.yml',
    jobLabel: 'tooling',
    // Derived from toolingWorkflowProjectNames, not re-enumerated — see tooling-project-registry.mts.
    invocation: 'tooling-registry',
    projects: noCredential(toolingWorkflowProjectNames),
  },
  {
    orchestratorJob: 'test-tooling',
    workflow: 'tests-tooling.yml',
    jobLabel: 'i18n-route-bounds',
    invocation: 'literal',
    projects: noCredential(dedicatedToolingWorkflowProjectNames),
  },
  {
    orchestratorJob: 'test-portability',
    workflow: 'tests-portability.yml',
    jobLabel: 'Linux + macOS portability',
    // Derived from VITEST_PROJECT_GROUPS.portability, not re-enumerated — see run-vitest-project-group.mts.
    invocation: 'portability-group',
    projects: noCredential(VITEST_PROJECT_GROUPS.portability),
  },
  {
    orchestratorJob: 'test-backend-modules',
    workflow: 'tests-backend-modules.yml',
    jobLabel: 'backend-modules',
    // Its depcruise/tsc static gates moved to checks-static.yml; pure Vitest now.
    invocation: 'literal',
    projects: noCredential([
      'backend/data-stores/analytics',
      'backend/services/analytics',
      'backend-modules',
      'backend-no-data-mocks',
      'backend-test-helpers',
      'backend-contract-program',
      'backend-email-templates',
    ]),
  },
  {
    orchestratorJob: 'test-backend-unit',
    workflow: 'tests-backend-unit.yml',
    jobLabel: 'backend-tests',
    sharding: {
      mode: 'file-count',
      reportPrefix: 'backend-shard',
      filesPerShard: 350,
    },
    invocation: 'literal',
    projects: noCredential([
      'backend/analytics-integration',
      'backend-data-stores',
      'backend-mocks',
      'backend-real-glide-mq',
    ]),
  },
  {
    orchestratorJob: 'test-postgres-schema',
    workflow: 'tests-postgres-schema.yml',
    jobLabel: 'postgres-schema-tests',
    invocation: 'literal',
    projects: noCredential(['backend-postgres-schema', 'backend-activitypub-capacity']),
  },
  {
    orchestratorJob: 'test-backend-credentialed',
    workflow: 'tests-backend-credentialed.yml',
    jobLabel: 'backend-credentialed-tests',
    invocation: 'literal',
    projects: [
      { project: 'backend-aws', credential: 'AWS tests role' },
      { project: 'backend-bedrock', credential: 'AWS tests role + Bedrock' },
      { project: 'backend-openai', credential: 'OPENAI_API_KEY' },
      { project: 'backend-openrouter', credential: 'OPENROUTER_API_KEY' },
      { project: 'backend-stripe', credential: 'STRIPE_SECRET_KEY' },
    ],
  },
  {
    orchestratorJob: 'test-web',
    workflow: 'tests-web.yml',
    jobLabel: 'web-tests (sharded)',
    sharding: {
      mode: 'file-count',
      reportPrefix: 'web-shard',
      filesPerShard: 500,
    },
    invocation: 'literal',
    projects: noCredential(['web']),
  },
  {
    orchestratorJob: 'storybook',
    workflow: 'storybook.yml',
    jobLabel: 'storybook',
    invocation: 'storybook',
    projects: [
      { project: 'web-storybook', credential: NONE },
      { project: 'web-storybook-component-coverage', credential: NONE },
      {
        project: 'web-storybook-browser',
        credential: NONE,
        browserRunner: true,
      },
    ],
  },
  {
    orchestratorJob: 'test-web-api',
    workflow: 'tests-web-api.yml',
    jobLabel: 'web-api-tests (sharded)',
    sharding: {
      mode: 'file-count',
      reportPrefix: 'web-api-shard',
      filesPerShard: 64,
    },
    invocation: 'literal',
    projects: noCredential(['web-api']),
  },
  {
    orchestratorJob: 'test-web-integration',
    workflow: 'tests-web-integration.yml',
    jobLabel: 'web-integration-tests (sharded)',
    sharding: {
      mode: 'fixed',
      reportPrefix: 'web-integration-shard',
      shards: 1,
    },
    invocation: 'literal',
    projects: noCredential(['web-integration']),
  },
  {
    orchestratorJob: 'test-lambdas',
    workflow: 'tests-lambdas.yml',
    jobLabel: 'lambdas-tests',
    // Its depcruise/tsc gates (and the SES ARM64 artifact build) moved to checks-static.yml.
    invocation: 'literal',
    projects: noCredential(['lambdas', 'lambdas-mocks']),
  },
  {
    orchestratorJob: 'test-cloudflare-worker',
    workflow: 'tests-cloudflare-worker.yml',
    jobLabel: 'cloudflare-worker-tests',
    // Its tsc/smoke/wrangler-dry-run static gates moved to checks-static.yml; pure Vitest now.
    invocation: 'literal',
    projects: noCredential(['cloudflare-worker', 'cloudflare-worker-mocks']),
  },
] satisfies readonly VitestJobOwnership[]
