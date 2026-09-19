import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import picomatch from 'picomatch'
import { describe, expect, it } from 'vitest'

type WorkflowStep = { id?: string; with?: { filters?: string } }
type WorkflowJob = { if?: string; outputs?: Record<string, string>; steps?: WorkflowStep[] }
type Workflow = { jobs?: Record<string, WorkflowJob> & { 'detect-changes'?: WorkflowJob } }
type PathFilters = Record<string, string[]>

const workflow = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow
const detectChangesWorkflow = load(
  readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8'),
) as Workflow
const filters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as PathFilters
const refinedFilters = load(
  readFileSync('.github/ci-runtime-path-filters.yml', 'utf8'),
) as PathFilters

function pathMatches(globs: string[], path: string, every = false): boolean {
  const matches = (glob: string) => picomatch.isMatch(path, glob, { dot: true })
  return every ? globs.every(matches) : globs.some(matches)
}

function expectPrimaryMatches(filterName: string, paths: string[]): void {
  const globs = filters[filterName]
  expect(globs).toBeDefined()
  expect(paths.filter(path => !pathMatches(globs!, path))).toEqual([])
}

function expectPrimaryMisses(filterName: string, paths: string[]): void {
  const globs = filters[filterName]
  expect(globs).toBeDefined()
  expect(paths.filter(path => pathMatches(globs!, path))).toEqual([])
}

function changedFilesMatchPrimary(filterName: string, paths: string[]): boolean {
  const globs = filters[filterName]
  expect(globs).toBeDefined()
  return paths.some(path => pathMatches(globs!, path))
}

describe('Vitest CI Docker triggers', () => {
  it('routes worker policy changes through image validation', () => {
    const workerPolicyPath = 'backend/modules/worker-queue-inventory/worker-queue-policy.json'
    for (const filterName of ['build-backend-infra']) {
      expectPrimaryMatches(filterName, [workerPolicyPath])
    }
  })

  it('routes Docker smoke port allocator inputs through both PR image builds', () => {
    const smokePortInputs = ['ci/allocate-browser-safe-ports.py']

    expectPrimaryMatches('build-backend-infra', smokePortInputs)
    expectPrimaryMatches('build-web-infra', smokePortInputs)
  })

  it('uses primary infra filters on PRs and broad refined filters otherwise', () => {
    const outputs = detectChangesWorkflow.jobs?.['detect-changes']?.outputs ?? {}
    expect(outputs['build-backend-infra']).toBe('${{ steps.filter.outputs.build-backend-infra }}')
    expect(outputs['build-web-infra']).toBe('${{ steps.filter.outputs.build-web-infra }}')
    expect(refinedFilters['build-backend-infra']).toBeUndefined()
    expect(refinedFilters['build-web-infra']).toBeUndefined()

    for (const [jobName, infraFilter, broadFilter] of [
      ['build-backend', 'build-backend-infra', 'build-backend'],
      ['build-web', 'build-web-infra', 'build-web'],
    ]) {
      const condition = workflow.jobs?.[jobName]?.if ?? ''
      expect(condition).toContain(
        `github.event_name == 'pull_request' && needs.detect-changes.outputs.${infraFilter} == 'true'`,
      )
      expect(condition).toContain(`needs.detect-changes.outputs.${broadFilter} == 'true'`)
      expect(condition).toContain("needs.detect-changes.outputs.workflow-action-changes != 'false'")
    }
  })

  it('matches the root dependency boundary and manifests that scope the backend image', () => {
    expect(filters['build-backend-infra']?.some(glob => glob.startsWith('!'))).toBe(false)
    expectPrimaryMatches('build-backend-infra', [
      'pnpm-workspace.yaml',
      'package.json',
      'pnpm-lock.yaml',
      'backend/package.json',
      'backend/types/package.json',
      'backend/entrypoints/api/package.json',
      'ci/package.json',
      'email-templates/package.json',
      'ts-shared/utils/package.json',
      'backend/modules/worker-queue-inventory/worker-queue-policy.json',
    ])
    expectPrimaryMisses('build-backend-infra', [
      'web/package.json',
      'cloudflare-worker/package.json',
      'backend/agents/foo/bar/package.json',
      '.github/actions/build-web-targets/action.yml',
      '.github/actions/setup-aws/index.mts',
      'backend/services/foo.mts',
    ])
  })

  it('matches the root dependency boundary and manifests that scope the web image', () => {
    expect(filters['build-web-infra']?.some(glob => glob.startsWith('!'))).toBe(false)
    expectPrimaryMatches('build-web-infra', [
      'pnpm-workspace.yaml',
      'package.json',
      'pnpm-lock.yaml',
      'web/package.json',
      'backend/types/package.json',
      'ts-shared/utils/package.json',
    ])
    expectPrimaryMisses('build-web-infra', [
      'backend/package.json',
      'backend/entrypoints/api/package.json',
      'email-templates/package.json',
      'cloudflare-worker/package.json',
      '.github/actions/build-web-targets/action.yml',
      '.github/actions/setup-aws/index.mts',
      'web/app/page.tsx',
    ])
  })

  it('fails open at shared dependency boundaries without cross-triggering isolated manifests', () => {
    for (const sharedPath of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
      expect(changedFilesMatchPrimary('build-backend-infra', [sharedPath])).toBe(true)
      expect(changedFilesMatchPrimary('build-web-infra', [sharedPath])).toBe(true)
    }

    expect(
      changedFilesMatchPrimary('build-backend-infra', ['web/package.json', 'pnpm-lock.yaml']),
    ).toBe(true)
    expect(
      changedFilesMatchPrimary('build-web-infra', ['backend/package.json', 'pnpm-lock.yaml']),
    ).toBe(true)
    expect(changedFilesMatchPrimary('build-backend-infra', ['web/package.json'])).toBe(false)
    expect(changedFilesMatchPrimary('build-web-infra', ['backend/package.json'])).toBe(false)
    expect(
      changedFilesMatchPrimary('build-backend-infra', ['cloudflare-worker/package.json']),
    ).toBe(false)
  })

  it('tracks backend packaging helpers in broad and PR filters', () => {
    const helpers = [
      'static-code-analysis/docker-deploy/prune-deployed-runtime-deps.mts',
      'static-code-analysis/docker-deploy/restore-deployed-workspace-packages.mts',
    ]
    expectPrimaryMatches('build-backend', helpers)
    expectPrimaryMatches('build-backend-infra', helpers)
    expect(
      helpers.filter(path => !pathMatches(refinedFilters['build-backend']!, path, true)),
    ).toEqual([])
  })

  it('matches mixed changes only when true Docker infrastructure is present', () => {
    expect(
      changedFilesMatchPrimary('build-backend-infra', [
        'backend/modules/worker-queue-inventory/worker-queue-policy.json',
      ]),
    ).toBe(true)
    expect(
      changedFilesMatchPrimary('build-backend-infra', [
        'docs/development/ci.md',
        'backend/Dockerfile',
      ]),
    ).toBe(true)
    expect(changedFilesMatchPrimary('build-backend-infra', ['docs/README.md'])).toBe(false)
    expect(changedFilesMatchPrimary('build-web-infra', ['web/app/page.tsx', '.dockerignore'])).toBe(
      true,
    )
    expect(changedFilesMatchPrimary('build-web-infra', ['web/app/page.tsx'])).toBe(false)
  })
})
