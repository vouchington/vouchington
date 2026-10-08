import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  checkNoMistakesTestPolicy,
  relevantWorkflowCommands,
  spawnsNoMistakesCli,
} from './check-no-mistakes-test-policy.mts'
import {
  acceptedTestSources,
  cliSpawnSources,
  makeNoMistakesPolicyFixture,
  malformedWorkflow,
  nonNoMistakesCliSource,
  rejectedTestSources,
  staticAnalysisWorkflow,
  unrelatedWorkflows,
  workflowWithDuplicate,
  workflowWithWrongOrder,
} from './test-helpers/no-mistakes-test-policy-fixtures.mts'

const fixtureRoots: string[] = []

function fixture(options: Parameters<typeof makeNoMistakesPolicyFixture>[0] = {}) {
  const input = makeNoMistakesPolicyFixture(options)
  fixtureRoots.push(input.root)
  return input
}

describe('no-mistakes CI contention policy', () => {
  afterEach(() => {
    for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('accepts the sole ordered static-analysis commands and small test inputs', () => {
    const input = fixture({ tests: acceptedTestSources, otherWorkflows: unrelatedWorkflows })
    expect(checkNoMistakesTestPolicy(input)).toEqual([])
    expect(relevantWorkflowCommands(input.root, input.workflowPaths)).toEqual([
      {
        path: '.github/workflows/static-code-analysis.yml',
        job: 'no-mistakes',
        command:
          'pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
      },
      {
        path: '.github/workflows/static-code-analysis.yml',
        job: 'no-mistakes',
        command: 'node ci/check-no-mistakes-test-policy.mts',
      },
      {
        path: '.github/workflows/static-code-analysis.yml',
        job: 'no-mistakes',
        command: 'node ci/check-live-workflow-topology.mts',
      },
    ])
  })

  it('rejects duplicate or reordered live workflow commands from parsed YAML', () => {
    const duplicate = fixture({ workflow: workflowWithDuplicate })
    expect(checkNoMistakesTestPolicy(duplicate)).toEqual([
      expect.stringContaining('"job":"extra","command":"pnpm run no-mistakes"'),
    ])

    const reordered = fixture({ workflow: workflowWithWrongOrder })
    expect(checkNoMistakesTestPolicy(reordered)).toEqual([
      expect.stringContaining('sole ordered static-analysis job contract'),
    ])
  })

  it('rejects live route-selector and CLI use in Vitest tests', () => {
    const input = fixture({
      tests: rejectedTestSources,
      routeSelectorTest: 'await computeRouteAliasMap()',
    })
    expect(checkNoMistakesTestPolicy(input)).toEqual([
      'static-code-analysis/i18n-extract/route-selector-map.test.mts must not call the live route-selector graph',
      'ci/live-cli.test.mts: no-mistakes CLI from Vitest',
    ])
  })

  it('rejects direct, resolved-bin, and pnpm no-mistakes CLI spawns', () => {
    expect(cliSpawnSources.map(spawnsNoMistakesCli)).toEqual([true, true, true, true])
    expect(spawnsNoMistakesCli(nonNoMistakesCliSource)).toBe(false)
  })

  it('fails when the live command moves to another workflow', () => {
    const input = fixture({
      workflow: staticAnalysisWorkflow.replace(
        '      - run: node ci/check-live-workflow-topology.mts\n',
        '',
      ),
      otherWorkflows: {
        '.github/workflows/extra.yml':
          'jobs:\n  audit:\n    steps:\n      - run: node ci/check-live-workflow-topology.mts\n',
      },
    })
    expect(checkNoMistakesTestPolicy(input)).toEqual([
      expect.stringContaining('"path":".github/workflows/extra.yml"'),
    ])
  })

  it('ignores unrelated YAML keys and reports a changed no-mistakes command', () => {
    const input = fixture()
    writeFileSync(
      join(input.root, '.github/workflows/static-code-analysis.yml'),
      `${staticAnalysisWorkflow}env:\n  MESSAGE: no-mistakes\n`,
    )
    expect(checkNoMistakesTestPolicy(input)).toEqual([])

    writeFileSync(
      join(input.root, '.github/workflows/static-code-analysis.yml'),
      staticAnalysisWorkflow.replace(
        'check --tsconfig tsconfig.json',
        'check --tsconfig other.json',
      ),
    )
    expect(checkNoMistakesTestPolicy(input)).toEqual([
      expect.stringContaining('check --tsconfig other.json'),
    ])
  })

  it('fails closed with a path and code for missing declared policy inputs', () => {
    const workflow = fixture()
    rmSync(join(workflow.root, '.github/workflows/static-code-analysis.yml'))
    expect(() => checkNoMistakesTestPolicy(workflow)).toThrow(
      expect.objectContaining({
        name: 'PolicyInputError',
        code: 'READ_FAILED',
        path: '.github/workflows/static-code-analysis.yml',
      }),
    )

    const testSource = fixture()
    rmSync(join(testSource.root, 'ci/sample.test.mts'))
    expect(() => checkNoMistakesTestPolicy(testSource)).toThrow(
      expect.objectContaining({
        name: 'PolicyInputError',
        code: 'READ_FAILED',
        path: 'ci/sample.test.mts',
      }),
    )

    const routeSelector = fixture()
    rmSync(
      join(routeSelector.root, 'static-code-analysis/i18n-extract/route-selector-map.test.mts'),
    )
    expect(() => checkNoMistakesTestPolicy(routeSelector)).toThrow(
      expect.objectContaining({
        name: 'PolicyInputError',
        code: 'READ_FAILED',
        path: 'static-code-analysis/i18n-extract/route-selector-map.test.mts',
      }),
    )
  })

  it('fails closed with the workflow path when YAML is malformed', () => {
    const input = fixture({ workflow: malformedWorkflow })
    expect(() => checkNoMistakesTestPolicy(input)).toThrow(
      expect.objectContaining({
        name: 'PolicyInputError',
        code: 'INVALID_YAML',
        path: '.github/workflows/static-code-analysis.yml',
      }),
    )
  })
})
