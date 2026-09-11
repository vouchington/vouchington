import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import YAML from 'yaml'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function mainChecksPaths(): string[] {
  const workflow = YAML.parse(readFileSync(`${repoRoot}/.github/workflows/main-checks.yml`, 'utf8'))
  return workflow.on.push.paths
}

function pullRequestToolingPaths(): string[] {
  return YAML.parse(readFileSync(`${repoRoot}/.github/ci-path-filters.yml`, 'utf8')).tooling
}

function pullRequestBackendBuildPaths(): string[] {
  return YAML.parse(readFileSync(`${repoRoot}/.github/ci-path-filters.yml`, 'utf8'))[
    'build-backend-infra'
  ]
}

describe('Main checks workflow selection', () => {
  it('runs the workspace-boundary tooling guard when its backend package sources or manifests change', () => {
    expect(mainChecksPaths()).toEqual(
      expect.arrayContaining([
        'api-fixtures/package.json',
        'backend/**',
        'pnpm-workspace.yaml',
        'ts-shared/**',
        'static-code-analysis/**',
        'docs/prompts/**',
        '.agents/skills/**',
      ]),
    )
  })

  it('runs the workspace-boundary tooling guard for pull-request backend changes', () => {
    expect(pullRequestToolingPaths()).toEqual(
      expect.arrayContaining([
        // Covers "api-fixtures/package.json" (and every other manifest) via this catch-all
        // rather than a per-manifest literal — see ci/workspace-package-registry-coverage.test.mts.
        '**/package.json',
        'backend/**',
        'pnpm-workspace.yaml',
        'ts-shared/**',
        'static-code-analysis/**',
        'docs/prompts/**',
        '.agents/skills/**',
      ]),
    )
  })

  it('runs the backend image build when a copied fixture manifest changes', () => {
    expect(pullRequestBackendBuildPaths()).toContain('api-fixtures/package.json')
  })
})
