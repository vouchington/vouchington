import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  checkNoMistakesTestPolicy,
  liveAnalysisImportNames,
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
  sdkImportFixture,
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

  it('accepts the sole ordered static-analysis commands and small test inputs', async () => {
    const input = fixture({ tests: acceptedTestSources, otherWorkflows: unrelatedWorkflows })
    expect(await checkNoMistakesTestPolicy(input)).toEqual([])
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

  it('rejects duplicate or reordered live workflow commands from parsed YAML', async () => {
    const duplicate = fixture({ workflow: workflowWithDuplicate })
    expect(await checkNoMistakesTestPolicy(duplicate)).toEqual([
      expect.stringContaining('"job":"extra","command":"pnpm run no-mistakes"'),
    ])

    const reordered = fixture({ workflow: workflowWithWrongOrder })
    expect(await checkNoMistakesTestPolicy(reordered)).toEqual([
      expect.stringContaining('sole ordered static-analysis job contract'),
    ])
  })

  it('rejects live route-selector, SDK, CLI, and topology use in Vitest tests', async () => {
    const input = fixture({
      tests: rejectedTestSources,
      routeSelectorTest: 'await computeRouteAliasMap()',
    })
    expect(await checkNoMistakesTestPolicy(input)).toEqual([
      'static-code-analysis/i18n-extract/route-selector-map.test.mts must not call the live route-selector graph',
      'ci/live-cli.test.mts: no-mistakes CLI from Vitest',
      'ci/live-import.test.mts: live no-mistakes import check',
      'ci/live-topology.test.mts: live loadRepoTopology() from Vitest',
    ])
  })

  it('selects runtime named imports from the SDK module at their original names', async () => {
    const input = fixture({ tests: { 'imports.test.mts': sdkImportFixture } })
    expect(await liveAnalysisImportNames(input.root, [])).toEqual(new Map())
    expect(await liveAnalysisImportNames(input.root, ['imports.test.mts'])).toEqual(
      new Map([['imports.test.mts', ['check', 'resolveCheck', 'check']]]),
    )
  })

  it('rejects direct, resolved-bin, and pnpm no-mistakes CLI spawns', () => {
    expect(cliSpawnSources.map(spawnsNoMistakesCli)).toEqual([true, true, true, true])
    expect(spawnsNoMistakesCli(nonNoMistakesCliSource)).toBe(false)
  })

  it('fails when the live command moves to another workflow', async () => {
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
    expect(await checkNoMistakesTestPolicy(input)).toEqual([
      expect.stringContaining('"path":".github/workflows/extra.yml"'),
    ])
  })

  it('ignores unrelated YAML keys and reports a changed no-mistakes command', async () => {
    const input = fixture()
    writeFileSync(
      join(input.root, '.github/workflows/static-code-analysis.yml'),
      `${staticAnalysisWorkflow}env:\n  MESSAGE: no-mistakes\n`,
    )
    expect(await checkNoMistakesTestPolicy(input)).toEqual([])

    writeFileSync(
      join(input.root, '.github/workflows/static-code-analysis.yml'),
      staticAnalysisWorkflow.replace(
        'check --tsconfig tsconfig.json',
        'check --tsconfig other.json',
      ),
    )
    expect(await checkNoMistakesTestPolicy(input)).toEqual([
      expect.stringContaining('check --tsconfig other.json'),
    ])
  })

  it('fails closed with a path and code for missing declared policy inputs', async () => {
    const workflow = fixture()
    rmSync(join(workflow.root, '.github/workflows/static-code-analysis.yml'))
    await expect(checkNoMistakesTestPolicy(workflow)).rejects.toMatchObject({
      name: 'PolicyInputError',
      code: 'READ_FAILED',
      path: '.github/workflows/static-code-analysis.yml',
    })

    const testSource = fixture()
    rmSync(join(testSource.root, 'ci/sample.test.mts'))
    await expect(checkNoMistakesTestPolicy(testSource)).rejects.toMatchObject({
      name: 'PolicyInputError',
      code: 'READ_FAILED',
      path: 'ci/sample.test.mts',
    })

    const routeSelector = fixture()
    rmSync(
      join(routeSelector.root, 'static-code-analysis/i18n-extract/route-selector-map.test.mts'),
    )
    await expect(checkNoMistakesTestPolicy(routeSelector)).rejects.toMatchObject({
      name: 'PolicyInputError',
      code: 'READ_FAILED',
      path: 'static-code-analysis/i18n-extract/route-selector-map.test.mts',
    })
  })

  it('fails closed with the workflow path when YAML is malformed', async () => {
    const input = fixture({ workflow: malformedWorkflow })
    await expect(checkNoMistakesTestPolicy(input)).rejects.toMatchObject({
      name: 'PolicyInputError',
      code: 'INVALID_YAML',
      path: '.github/workflows/static-code-analysis.yml',
    })
  })
})
