import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { runGuardFixtures } from './check-no-mistakes-guard-fixtures.mts'

const schemaGenerationGuardName = 'Vitest tests do not generate the full PostgreSQL schema snapshot'
const target = './backend/data-stores/psql/schema-snapshot/generate.mts'
const fixtures = [
  [
    'direct.test.mts',
    `import { generateSchemaSnapshot } from '${target}'; generateSchemaSnapshot()`,
    true,
  ],
  [
    'alias.test.mts',
    `import { generateSchemaSnapshot as snapshot } from '${target}'; snapshot()`,
    true,
  ],
  [
    'namespace.test.mts',
    `import * as schema from '${target}'; schema.generateSchemaSnapshot()`,
    true,
  ],
  ['reexport.test.mts', "import { snapshot } from './bridge.mts'; snapshot()", true],
  ['unrelated.test.mts', 'function generateSchemaSnapshot() {} generateSchemaSnapshot()', false],
  [
    'fragment.test.mts',
    `import { writeSchemaSnapshot } from '${target}'; writeSchemaSnapshot()`,
    false,
  ],
  [
    'command.mts',
    `import { generateSchemaSnapshot } from '${target}'; generateSchemaSnapshot()`,
    false,
  ],
  [
    'helper.test.mts',
    "import {run} from './test-helpers/one.mts'; run()",
    true,
    'test-helpers/one.mts',
  ],
  [
    'two-helpers.test.mts',
    "import {run} from './test-helpers/two-outer.mts'; run()",
    true,
    'test-helpers/two-inner.mts',
  ],
  [
    'namespace-helper.test.mts',
    "import * as helper from './test-helpers/namespace.mts'; helper.run()",
    true,
    'test-helpers/namespace.mts',
  ],
  [
    'unused-helper.test.mts',
    "import {run} from './test-helpers/unused.mts'; void run; function harmless(){} harmless()",
    false,
  ],
  ['dormant-helper.test.mts', "import {run} from './test-helpers/dormant.mts'; run()", false],
  [
    'cycle.test.mts',
    "import {one} from './test-helpers/cycle-one.mts'; one()",
    true,
    'test-helpers/cycle-two.mts',
  ],
] as const

async function checkSchemaGenerationGuardFixtures(rule: object): Promise<void> {
  await runGuardFixtures('schema-generation', rule, fixtures, {
    [target]:
      'export function generateSchemaSnapshot() {} export function writeSchemaSnapshot() {}',
    'bridge.mts': `export { generateSchemaSnapshot as snapshot } from '${target}'`,
    'test-helpers/one.mts': `import {generateSchemaSnapshot} from '.${target}'; export function run(){generateSchemaSnapshot()}`,
    'test-helpers/two-outer.mts':
      "import {run as inner} from './two-inner.mts'; export function run(){inner()}",
    'test-helpers/two-inner.mts': `import {generateSchemaSnapshot as snapshot} from '.${target}'; export function run(){snapshot()}`,
    'test-helpers/namespace.mts': `import * as schema from '.${target}'; export function run(){schema.generateSchemaSnapshot()}`,
    'test-helpers/unused.mts': `import {generateSchemaSnapshot} from '.${target}'; export function run(){generateSchemaSnapshot()}`,
    'test-helpers/dormant.mts': `import {generateSchemaSnapshot} from '.${target}'; export function run(){return 1}; export function unused(){generateSchemaSnapshot()}`,
    'test-helpers/cycle-one.mts':
      "import {two} from './cycle-two.mts'; export function one(){two()}",
    'test-helpers/cycle-two.mts': `import {one} from './cycle-one.mts'; import {generateSchemaSnapshot} from '.${target}'; export function two(){generateSchemaSnapshot(); one()}`,
  })
}

if (import.meta.main) {
  const path = fileURLToPath(new URL('../.no-mistakes.yml', import.meta.url))
  const config = parseYaml(await readFile(path, 'utf8')) as { rules: { name: string }[] }
  const schemaRules = config.rules.filter(rule => rule.name === schemaGenerationGuardName)
  if (schemaRules.length !== 1)
    throw new Error('Expected exactly one configured schema generation guard')
  await checkSchemaGenerationGuardFixtures(schemaRules[0]!)
}
