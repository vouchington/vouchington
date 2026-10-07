import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { NoMistakesTestPolicyInput } from '../check-no-mistakes-test-policy.mts'

export const staticAnalysisWorkflow = `name: Static Code Analysis
on: workflow_call
jobs:
  no-mistakes:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json
      - run: node ci/check-no-mistakes-test-policy.mts
      - run: node ci/check-live-workflow-topology.mts
`

export const malformedWorkflow = 'jobs: [unterminated\n'

export const sdkImportFixture = [
  "import { check as runCheck, type CheckOptions } from 'no-mistakes'",
  "import type { analyzeProject } from 'no-mistakes'",
  "import { type ciTopology, symbols } from 'no-mistakes'",
  "import { 'resolveCheck' as resolver, '\\u0063heck' as checker } from 'no-mistakes'",
  "import defaultApi from 'no-mistakes'",
  "import * as namespaceApi from 'no-mistakes'",
  "import { check } from 'other-module'",
  "const dynamic = import('no-mistakes')",
  "const { testsPlan } = require('no-mistakes')",
  "export { ciTopologyImpact } from 'no-mistakes'",
  "import requiredApi = require('no-mistakes')",
].join('\n')

export const acceptedTestSources = {
  'ci/allowed.test.mts': "import { symbols, type CheckOptions } from 'no-mistakes'",
  'ci/allowed.mock.test.mts': "import { check } from 'no-mistakes'",
  'ci/no-mistakes-ci-contention.test.mts': 'export const fixture = true',
}

export const rejectedTestSources = {
  'ci/live-import.test.mts': "import { check as runCheck } from 'no-mistakes'",
  'ci/live-cli.test.mts': "execFileSync('pnpm', ['exec', 'no-mistakes', 'check'])",
  'ci/live-topology.test.mts': 'await loadRepoTopology()',
}

export const cliSpawnSources = [
  "spawnSync('no-mistakes', ['check'])",
  "execFile(noMistakesBinary, ['check'])",
  "join(root, 'node_modules/.bin/no-mistakes')",
  "execFileSync('pnpm', ['exec', 'no-mistakes', 'check'])",
]

export const nonNoMistakesCliSource = "execFileSync('pnpm', ['exec', 'oxlint'])"

export const workflowWithDuplicate = `${staticAnalysisWorkflow}
  extra:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo before
          pnpm run no-mistakes
`

export const workflowWithWrongOrder = staticAnalysisWorkflow.replace(
  '      - run: pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json\n      - run: node ci/check-no-mistakes-test-policy.mts\n      - run: node ci/check-live-workflow-topology.mts',
  '      - run: node ci/check-live-workflow-topology.mts\n      - run: node ci/check-no-mistakes-test-policy.mts\n      - run: pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
)

export const unrelatedWorkflows = {
  '.github/workflows/empty.yml': 'name: Empty\n',
  '.github/workflows/other.yml':
    'jobs:\n  empty:\n    runs-on: ubuntu-latest\n  unrelated:\n    steps:\n      - uses: ./local/action\n      - run: echo hello\n',
}

export function makeNoMistakesPolicyFixture({
  workflow = staticAnalysisWorkflow,
  tests = { 'ci/sample.test.mts': "import { symbols } from 'no-mistakes'" },
  routeSelectorTest = 'export const fixture = true',
  otherWorkflows = {},
}: {
  workflow?: string
  tests?: Record<string, string>
  routeSelectorTest?: string
  otherWorkflows?: Record<string, string>
} = {}): NoMistakesTestPolicyInput {
  const root = mkdtempSync(join(tmpdir(), 'no-mistakes-test-policy-'))
  const workflowPaths = [
    '.github/workflows/static-code-analysis.yml',
    ...Object.keys(otherWorkflows),
  ]
  const files = {
    '.github/workflows/static-code-analysis.yml': workflow,
    'static-code-analysis/i18n-extract/route-selector-map.test.mts': routeSelectorTest,
    ...otherWorkflows,
    ...tests,
  }
  for (const [path, source] of Object.entries(files)) {
    const fullPath = join(root, path)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, source)
  }
  return { root, workflowPaths, testPaths: Object.keys(tests) }
}
