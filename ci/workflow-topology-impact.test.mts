import type { CiTopologyImpactReport } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

import {
  CI_WORKFLOW_PATH,
  CI_ROOT_JOB_IDS,
  loadCiTopologyImpactRouting,
  routeCiTopologyImpact,
  TOPOLOGY_ROOT_JOB_IDS,
} from './workflow-topology-impact.mts'

const changedPaths = ['.github/workflows/tests-web.yml']

function makeImpact(overrides: Partial<CiTopologyImpactReport> = {}): CiTopologyImpactReport {
  return {
    schemaVersion: 1,
    baseRevision: 'base-sha',
    headRevision: 'head-sha',
    changedPaths,
    affectedWorkflows: changedPaths,
    affectedRootJobIds: [`${CI_WORKFLOW_PATH}#test-web`],
    diagnostics: [],
    globalFallback: false,
    ...overrides,
  }
}

function route(impact: unknown, paths = changedPaths) {
  return routeCiTopologyImpact(impact, {
    input: { base: 'base-sha', head: 'head-sha', entryWorkflow: CI_WORKFLOW_PATH },
    changedPaths: paths,
    knownRootJobIds: CI_ROOT_JOB_IDS,
  })
}

describe('revision-aware CI topology impact routing', () => {
  it('accepts valid non-selectable CI prerequisite roots and preserves selectable routing', () => {
    expect(
      route(
        makeImpact({
          affectedRootJobIds: [
            `${CI_WORKFLOW_PATH}#detect-changes`,
            `${CI_WORKFLOW_PATH}#select-ci`,
            `${CI_WORKFLOW_PATH}#tests`,
            `${CI_WORKFLOW_PATH}#test-web`,
          ],
        }),
      ),
    ).toMatchObject({ globalFallback: false })
  })

  it('keeps a recognized standalone workflow with a bounded-empty root result narrow', () => {
    const workflow = '.github/workflows/gitleaks.yml'
    expect(
      route(
        makeImpact({
          changedPaths: [workflow],
          affectedWorkflows: [workflow],
          affectedRootJobIds: [],
        }),
        [workflow],
      ),
    ).toMatchObject({ globalFallback: false })
  })

  it('keeps a recognized deleted workflow with a bounded-empty root result narrow', () => {
    const workflow = '.github/workflows/deleted.yml'
    expect(
      route(
        makeImpact({
          changedPaths: [workflow],
          affectedWorkflows: [workflow],
          affectedRootJobIds: [],
        }),
        [workflow],
      ),
    ).toMatchObject({ globalFallback: false })
  })
  it('keeps a complete bounded workflow result narrow', () => {
    expect(route(makeImpact())).toEqual({
      affectedRootJobIds: new Set([`${CI_WORKFLOW_PATH}#test-web`]),
      globalFallback: false,
      topologyChanged: true,
    })
  })

  it('unions roots named by localized diagnostics into bounded routing', () => {
    expect(
      route(
        makeImpact({
          affectedRootJobIds: [`${CI_WORKFLOW_PATH}#test-web`],
          diagnostics: [
            {
              code: 'dynamic-action-input',
              message: 'caller could not be resolved completely',
              scope: 'localized',
              rootJobIds: [`${CI_WORKFLOW_PATH}#test-tooling`],
            },
          ],
        }),
      ),
    ).toMatchObject({
      affectedRootJobIds: new Set([
        `${CI_WORKFLOW_PATH}#test-web`,
        `${CI_WORKFLOW_PATH}#test-tooling`,
      ]),
      globalFallback: false,
    })
  })

  it('keeps a deleted local action descriptor bounded-empty when topology resolves no caller', () => {
    const action = '.github/actions/standalone/action.yml'
    expect(
      route(makeImpact({ changedPaths: [action], affectedWorkflows: [], affectedRootJobIds: [] }), [
        action,
      ]),
    ).toEqual({
      affectedRootJobIds: new Set(),
      globalFallback: false,
      topologyChanged: true,
    })
  })

  it.each(['.github/workflows/deleted.yml', '.github/workflows/unknown.yaml'])(
    'fails open when an unknown or deleted workflow is not represented: %s',
    path => {
      expect(
        route(makeImpact({ changedPaths: [path], affectedWorkflows: [], affectedRootJobIds: [] }), [
          path,
        ]),
      ).toMatchObject({
        affectedRootJobIds: new Set(TOPOLOGY_ROOT_JOB_IDS),
        globalFallback: true,
        reason: 'unrecognized deleted workflow descriptor',
      })
    },
  )

  it('forces a full CI result for any ci.yml change independent of provider output', () => {
    expect(
      route(
        makeImpact({
          changedPaths: [CI_WORKFLOW_PATH],
          affectedWorkflows: [],
          affectedRootJobIds: [],
        }),
        [CI_WORKFLOW_PATH],
      ),
    ).toMatchObject({
      affectedRootJobIds: new Set(TOPOLOGY_ROOT_JOB_IDS),
      globalFallback: true,
      reason: 'root ci workflow changed',
    })
  })

  it.each([
    ['explicit global fallback', makeImpact({ globalFallback: true })],
    ['unknown root', makeImpact({ affectedRootJobIds: [`${CI_WORKFLOW_PATH}#unknown`] })],
    [
      'duplicate root',
      makeImpact({
        affectedRootJobIds: [`${CI_WORKFLOW_PATH}#test-web`, `${CI_WORKFLOW_PATH}#test-web`],
      }),
    ],
    ['empty root', makeImpact({ affectedRootJobIds: [''] })],
    [
      'inconsistent global diagnostic',
      makeImpact({ diagnostics: [{ code: 'broken', message: 'broken', scope: 'global' }] }),
    ],
  ])('fails open for %s', (_name, impact) => {
    expect(route(impact)).toMatchObject({
      affectedRootJobIds: new Set(TOPOLOGY_ROOT_JOB_IDS),
      globalFallback: true,
    })
  })

  it('rejects malformed localized diagnostics and revision/path mismatches', () => {
    expect(
      route(
        makeImpact({
          diagnostics: [{ code: 'broken', message: 'broken', scope: 'localized', rootJobIds: [] }],
        }),
      ),
    ).toMatchObject({ globalFallback: true })
    expect(route(makeImpact({ headRevision: 'other' }))).toMatchObject({
      globalFallback: true,
      reason: 'topology impact revision mismatch',
    })
    expect(route(makeImpact({ changedPaths: ['.github/workflows/other.yml'] }))).toMatchObject({
      globalFallback: true,
      reason: 'topology impact changed-path mismatch',
    })
  })

  it('fails open when the provider errors', async () => {
    await expect(
      loadCiTopologyImpactRouting(
        async () => {
          throw new Error('revision not found')
        },
        {
          input: { base: 'base-sha', head: 'head-sha', entryWorkflow: CI_WORKFLOW_PATH },
          changedPaths,
          knownRootJobIds: CI_ROOT_JOB_IDS,
        },
      ),
    ).resolves.toMatchObject({
      affectedRootJobIds: new Set(TOPOLOGY_ROOT_JOB_IDS),
      globalFallback: true,
      reason: 'topology impact provider failed: revision not found',
    })
  })
})
