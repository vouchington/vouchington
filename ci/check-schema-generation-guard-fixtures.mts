import { mkdir, mkdtempDisposable, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { check } from 'no-mistakes'
import { parse as parseYaml } from 'yaml'

const name = 'Vitest tests do not generate the full PostgreSQL schema snapshot'
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
] as const

// A dedicated finite CLI: Vitest never invokes repository analyzers, directly or through a helper.
export async function checkSchemaGenerationGuardFixtures(rule: object): Promise<void> {
  await using directory = await mkdtempDisposable(join(tmpdir(), 'schema-generation-rule-'))
  const root = directory.path
  const sources: Record<string, string> = {
    'package.json': JSON.stringify({ type: 'module' }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ESNext' },
    }),
    'vitest.config.mts':
      "export default { test: { name: 'finite-schema', include: ['*.test.mts'], testTimeout: 5000, hookTimeout: 5000 } }",
    [target]:
      'export function generateSchemaSnapshot() {} export function writeSchemaSnapshot() {}',
    'bridge.mts': `export { generateSchemaSnapshot as snapshot } from '${target}'`,
    '.no-mistakes.json': JSON.stringify({
      rules: [rule],
      tests: { vitest: { configs: 'vitest.config.mts' } },
    }),
    ...Object.fromEntries(fixtures.map(([file, source]) => [file, source])),
  }
  const writes = await Promise.allSettled(
    Object.entries(sources).map(async ([file, source]) => {
      const path = join(root, file)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, source)
    }),
  )
  const errors: unknown[] = writes.flatMap(result =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (errors.length)
    throw new AggregateError(errors, 'Writing finite schema fixtures failed', { cause: errors[0] })
  const report = await check({ root, config: join(root, '.no-mistakes.json') })
  const actual = report.rules
    .flatMap(finding => (finding.rule === 'forbidden-calls' ? [finding.file] : []))
    .toSorted()
  const expected = fixtures.flatMap(([file, , forbidden]) => (forbidden ? [file] : [])).toSorted()
  if (report.warnings.length || JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `Schema guard fixture mismatch: ${JSON.stringify({ expected, actual, warnings: report.warnings })}`,
    )
  console.log(
    JSON.stringify({
      fixtures: fixtures.length,
      rejected: actual.length,
      allowed: fixtures.length - actual.length,
    }),
  )
}

if (import.meta.main) {
  const path = fileURLToPath(new URL('../.no-mistakes.yml', import.meta.url))
  const config = parseYaml(await readFile(path, 'utf8')) as { rules: { name: string }[] }
  const rules = config.rules.filter(rule => rule.name === name)
  if (rules.length !== 1) throw new Error('Expected exactly one configured schema generation guard')
  await checkSchemaGenerationGuardFixtures(rules[0]!)
}
