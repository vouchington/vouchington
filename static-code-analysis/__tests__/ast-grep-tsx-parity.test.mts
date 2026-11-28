import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { withPackRuleDir } from '../ast-grep-pack-config.mts'
import { ruleYamlWithoutExamples, writeRuleTreeWithoutExamples } from '../ast-grep-rule-yaml.mts'

describe('ast-grep rule directories', () => {
  it('prepends the pack directory without duplicating it', () => {
    const packRules = '/fixture/shared-pack/rules'
    expect(withPackRuleDir({ ruleDirs: ['ast-grep-rules'] }, packRules).ruleDirs).toEqual([
      packRules,
      'ast-grep-rules',
    ])
    expect(
      withPackRuleDir({ ruleDirs: [packRules, 'ast-grep-rules'] }, packRules).ruleDirs,
    ).toEqual([packRules, 'ast-grep-rules'])
  })
})

describe('ast-grep rule examples', () => {
  it('drops the example-runner field and keeps the matcher', () => {
    const source = [
      'id: sample',
      'language: Tsx',
      'examples:',
      '  - code: foo()',
      '    isValid: false',
      '    file: src/bad.ts',
      'rule:',
      '  pattern: foo()',
      '',
    ].join('\n')

    expect(parse(ruleYamlWithoutExamples(source))).toEqual({
      id: 'sample',
      language: 'Tsx',
      rule: { pattern: 'foo()' },
    })
  })

  it('leaves a rule without examples unchanged', () => {
    const source = 'id: sample\nrule:\n  kind: object\n'
    expect(ruleYamlWithoutExamples(source)).toBe(source)
  })

  it('copies a nested rule tree without example fixtures', () => {
    const source = [
      'id: nested',
      'language: Json',
      'rule:',
      '  kind: object',
      'examples:',
      '  - code: "{}"',
      '    isValid: true',
      '    file: backend/package.json',
      '',
    ].join('\n')
    const root = mkdtempSync(join(tmpdir(), 'ast-grep-rule-tree-'))
    try {
      const rules = join(root, 'rules', 'nested')
      mkdirSync(rules, { recursive: true })
      writeFileSync(join(rules, 'rule.yml'), source)
      const dest = join(root, 'stripped')
      writeRuleTreeWithoutExamples(join(root, 'rules'), dest)
      expect(readFileSync(join(root, 'stripped', 'nested', 'rule.yml'), 'utf8')).not.toMatch(
        /^examples:/m,
      )
      expect(parse(readFileSync(join(dest, 'nested', 'rule.yml'), 'utf8'))).toEqual({
        id: 'nested',
        language: 'Json',
        rule: { kind: 'object' },
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('no-sql-in-backend-tests shrinking ignores list', () => {
  const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  const rulePath = join(repoRoot, 'ast-grep-rules', 'no-sql-in-backend-tests.yml')
  // 2 helper globs + 6 package self-tests.
  // Exact count so removing an entry requires lowering this number in the same PR.
  const EXPECTED_TOTAL_IGNORES = 8
  // 27 synthetic ExplainResult/probe fixtures in backend/scripts/explain-analyze +
  // 3 DDL-invariant parser fixtures in backend/data-stores/psql/config-driven/__tests__ +
  // 1 synthetic view definition in backend/data-stores/psql/__tests__/schema-snapshot-verification.test.mts.
  const EXPECTED_INLINE_IGNORES = 31
  // Bare `ast-grep-ignore` (without a `: <rule-id>` list) suppresses every rule, including this one.
  const EXPECTED_BARE_INLINE_IGNORES = 0

  it('locks total ignores to 8 and rejects duplicates or stale file paths', () => {
    const parsed = parse(readFileSync(rulePath, 'utf8')) as { ignores?: string[] }
    const ignores = parsed.ignores ?? []

    expect(ignores.length).toBe(EXPECTED_TOTAL_IGNORES)
    expect(new Set(ignores).size).toBe(ignores.length)
    const missing = ignores
      .filter(entry => !entry.includes('*'))
      .filter(relativePath => !existsSync(join(repoRoot, relativePath)))
    expect(missing).toEqual([])
  })

  it('locks inline and bare ast-grep-ignore suppressions for no-sql-in-backend-tests', () => {
    const parsed = parse(readFileSync(rulePath, 'utf8')) as { files?: string[] }
    const fileGlobs = (parsed.files ?? []).map(glob => `:(glob)${glob}`)

    const namedGrep = spawnSync(
      'git',
      [
        'grep',
        '-n',
        '-F',
        'ast-grep-ignore',
        '--',
        '.',
        ':!static-code-analysis/__tests__/ast-grep-tsx-parity.test.mts',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    )
    if (namedGrep.error) throw namedGrep.error
    if (namedGrep.status !== 0 && namedGrep.status !== 1) {
      throw new Error(`git grep failed (${String(namedGrep.status)}): ${namedGrep.stderr}`)
    }
    const namedSuppressions =
      namedGrep.status === 1
        ? []
        : namedGrep.stdout
            .split('\n')
            .filter(line => /ast-grep-ignore[^\n]*\bno-sql-in-backend-tests\b/u.test(line))

    expect(namedSuppressions.length).toBe(EXPECTED_INLINE_IGNORES)

    const bareGrep = spawnSync('git', ['grep', '-n', '-F', 'ast-grep-ignore', '--', ...fileGlobs], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    if (bareGrep.error) throw bareGrep.error
    if (bareGrep.status !== 0 && bareGrep.status !== 1) {
      throw new Error(`git grep failed (${String(bareGrep.status)}): ${bareGrep.stderr}`)
    }
    const bareSuppressions =
      bareGrep.status === 1
        ? []
        : bareGrep.stdout
            .split('\n')
            .filter(line => /(?:\/\/|\/\*)\s*ast-grep-ignore\b(?!\s*:\s*[a-z0-9-]+)/iu.test(line))

    expect(bareSuppressions).toHaveLength(EXPECTED_BARE_INLINE_IGNORES)
  })
})
