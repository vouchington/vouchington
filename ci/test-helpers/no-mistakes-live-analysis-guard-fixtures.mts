import { runGuardFixtures, type GuardFixture } from './no-mistakes-guard-fixture-runner.mts'

const directFixtures: readonly GuardFixture[] = [
  ['direct.test.mts', "import { analyzeProject } from 'no-mistakes'; analyzeProject()", true],
  ['renamed.test.mts', "import { check as runCheck } from 'no-mistakes'; runCheck()", true],
  ['namespace.test.mts', "import * as analyzer from 'no-mistakes'; analyzer.symbols()", true],
  [
    'member-alias.test.mts',
    "import * as analyzer from 'no-mistakes'; const { symbols: list } = analyzer; list()",
    true,
  ],
  [
    'static-code-analysis/i18n-extract/route-selector-map.mock.test.mts',
    "import { vi } from 'vitest'; import { analyzeProject } from 'no-mistakes'; vi.mock('no-mistakes', () => ({})); analyzeProject()",
    false,
  ],
  ['other/live.mock.test.mts', "import { check } from 'no-mistakes'; check()", true],
  ['unrelated.test.mts', 'function analyzeProject() {} analyzeProject()', false],
  ['unused.test.mts', "import { check } from 'no-mistakes'; void check", false],
  ['command.mts', "import { check } from 'no-mistakes'; check()", false],
]

const transitiveCapabilityFixtures: readonly GuardFixture[] = [
  ['reexport.test.mts', "import { inspect } from './bridge.mts'; inspect()", true],
  [
    'helper.test.mts',
    "import { inspect } from './test-helpers/analyzer.mts'; inspect()",
    true,
    'test-helpers/analyzer.mts',
  ],
  [
    'two-helpers.test.mts',
    "import { inspect } from './test-helpers/outer.mts'; inspect()",
    true,
    'test-helpers/inner.mts',
  ],
  [
    'cycle.test.mts',
    "import { one } from './test-helpers/cycle-one.mts'; one()",
    true,
    'test-helpers/cycle-two.mts',
  ],
  [
    'other/live-helper.mock.test.mts',
    "import { inspect } from '../test-helpers/adjacent-analyzer.mts'; inspect()",
    true,
    'test-helpers/adjacent-analyzer.mts',
  ],
  ['dormant.test.mts', "import { run } from './test-helpers/dormant.mts'; run()", false],
  ['command.mts', "import { check } from 'no-mistakes'; check()", false],
]

const noMistakesExports = [
  'analyzeProject',
  'analyzeTypeScriptModules',
  'check',
  'ciTopology',
  'ciTopologyImpact',
  'dependencies',
  'importUsages',
  'resolveCheck',
  'symbols',
  'testsPlan',
  'validateMermaidMarkdown',
]

const analyzerSources: Record<string, string> = {
  'node_modules/no-mistakes/package.json': JSON.stringify({
    name: 'no-mistakes',
    type: 'module',
    exports: { '.': './index.mts' },
  }),
  'node_modules/no-mistakes/index.mts': noMistakesExports
    .map(name => `export function ${name}() {}`)
    .join('\n'),
  'node_modules/vitest/package.json': JSON.stringify({
    name: 'vitest',
    type: 'module',
    exports: { '.': './index.mts' },
  }),
  'node_modules/vitest/index.mts': 'export const vi = { mock() {} }',
  'bridge.mts': "export { check as inspect } from 'no-mistakes'",
  'test-helpers/analyzer.mts':
    "import { analyzeProject as analyze } from 'no-mistakes'; export function inspect(){analyze()}",
  'test-helpers/adjacent-analyzer.mts':
    "import { check } from 'no-mistakes'; export function inspect(){check()}",
  'test-helpers/outer.mts':
    "import { inspect as inner } from './inner.mts'; export function inspect(){inner()}",
  'test-helpers/inner.mts':
    "import * as analyzer from 'no-mistakes'; export function inspect(){analyzer.dependencies()}",
  'test-helpers/cycle-one.mts':
    "import { two } from './cycle-two.mts'; export function one(){two()}",
  'test-helpers/cycle-two.mts':
    "import { one } from './cycle-one.mts'; import { testsPlan } from 'no-mistakes'; export function two(){testsPlan(); one()}",
  'test-helpers/dormant.mts':
    "import { check } from 'no-mistakes'; export function run(){return 1}; export function ignored(){check()}",
}

export function checkLiveAnalysisGuardFixtures(rule: object): Promise<void> {
  return runGuardFixtures('live-analysis-direct-guard', rule, directFixtures, analyzerSources)
}

export function checkLiveAnalysisTransitiveCapabilityFixtures(rule: object): Promise<void> {
  const sourceRule = rule as { options?: Record<string, unknown> }
  const diagnosticRule = {
    ...sourceRule,
    options: { ...sourceRule.options, traversal: 'transitive' },
  }
  return runGuardFixtures(
    'live-analysis-transitive-capability-diagnostic',
    diagnosticRule,
    transitiveCapabilityFixtures,
    analyzerSources,
  )
}
