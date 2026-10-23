import { mkdir, mkdtempDisposable, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { check } from 'no-mistakes'

export type GuardFixture = readonly [
  file: string,
  source: string,
  forbidden: boolean,
  findingFile?: string,
]

export async function runGuardFixtures(
  name: string,
  rule: object,
  fixtures: readonly GuardFixture[],
  fixtureSources: Record<string, string>,
): Promise<void> {
  await using directory = await mkdtempDisposable(join(tmpdir(), `forbidden-call-rule-${name}-`))
  const root = directory.path
  const sources: Record<string, string> = {
    'package.json': JSON.stringify({ type: 'module' }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ESNext' },
    }),
    'vitest.config.mts':
      "export default { test: { name: 'finite-schema', include: ['**/*.test.mts'], testTimeout: 5000, hookTimeout: 5000 } }",
    ...fixtureSources,
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
    throw new AggregateError(errors, 'Writing finite forbidden-call fixtures failed', {
      cause: errors[0],
    })
  const report = await check({ root, config: join(root, '.no-mistakes.json') })
  const actual = report.rules
    .flatMap(finding => (finding.rule === 'forbidden-calls' ? [finding.file] : []))
    .toSorted()
  const expected = fixtures
    .flatMap(([file, , forbidden, findingFile]) => (forbidden ? [findingFile ?? file] : []))
    .toSorted()
  if (report.warnings.length || JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `${name} guard fixture mismatch: ${JSON.stringify({ expected, actual, warnings: report.warnings })}`,
    )
  console.log(JSON.stringify({ guard: name, fixtures: fixtures.length, rejected: actual.length }))
}
