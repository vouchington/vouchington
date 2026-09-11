import type { CoverageSuiteDescriptor } from 'coverage-check'

import { coverageConfigForScope } from '../test-helpers/vitest-config/coverage-config.mts'
import { VITEST_OWNERSHIP } from './vitest/project-ownership.mts'
import type { VitestJobOwnership, VitestShardPolicy } from './vitest/project-ownership-types.mts'

export const projectsByJob = Object.fromEntries(
  VITEST_OWNERSHIP.map(job => [job.orchestratorJob, job.projects.map(({ project }) => project)]),
) as Record<string, readonly string[]>

export interface ShardedCoverageJob {
  readonly job: VitestJobOwnership
  readonly policy: VitestShardPolicy
  readonly producerGroup: string
}

export const shardedCoverageJobs: readonly ShardedCoverageJob[] = VITEST_OWNERSHIP.flatMap(job =>
  job.sharding === undefined
    ? []
    : [
        {
          job,
          policy: job.sharding,
          producerGroup: job.orchestratorJob.replace(/^test-/, ''),
        },
      ],
)

export function shardedCoverageJobForSuite(
  suite: string,
): { readonly shard: number; readonly coverageJob: ShardedCoverageJob } | undefined {
  for (const coverageJob of shardedCoverageJobs) {
    const match = new RegExp(`^${coverageJob.policy.reportPrefix}-([1-9][0-9]*)$`).exec(suite)
    if (match) return { coverageJob, shard: Number(match[1]) }
  }
  return undefined
}

export function vitestDescriptor(
  suite: string,
  job: string,
  projects = projectsByJob[job] ?? [],
  coverageScope?: string,
): CoverageSuiteDescriptor {
  const config = coverageConfigForScope(coverageScope)
  return {
    suite,
    projects,
    collector: {
      name: 'vitest-v8',
      settings: {
        all: false,
        exclude: config.exclude,
        include: config.include,
        provider: 'v8',
        reporters: config.reporter,
        scope: coverageScope ?? null,
      },
    },
  }
}

export const staticCoverageDescriptors: readonly CoverageSuiteDescriptor[] = [
  vitestDescriptor('ts-shared', 'test-ts-shared'),
  vitestDescriptor('tooling', 'test-tooling', undefined, 'tooling'),
  vitestDescriptor('backend-credentialed', 'test-backend-credentialed'),
  vitestDescriptor('backend-modules', 'test-backend-modules'),
  vitestDescriptor(
    'web-storybook',
    'storybook',
    ['web-storybook', 'web-storybook-component-coverage'],
    'web-storybook',
  ),
  vitestDescriptor(
    'web-storybook-browser',
    'storybook',
    ['web-storybook-browser'],
    'web-storybook-browser',
  ),
  vitestDescriptor('cloudflare-worker', 'test-cloudflare-worker'),
  vitestDescriptor('lambdas', 'test-lambdas'),
  vitestDescriptor('portability-linux', 'test-portability', undefined, 'portability'),
  vitestDescriptor('portability-macos', 'test-portability', undefined, 'portability'),
]
