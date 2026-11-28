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
  const MAX_SCHEMA_TEST_IGNORES = 23

  it('caps the psql schema test ignores list at 23 and rejects duplicates or stale paths', () => {
    const parsed = parse(readFileSync(rulePath, 'utf8')) as { ignores?: string[] }
    const ignores = parsed.ignores ?? []
    const schemaIgnores = ignores.filter(entry =>
      entry.startsWith('backend/data-stores/psql/__tests__/'),
    )

    expect(schemaIgnores.length).toBeLessThanOrEqual(MAX_SCHEMA_TEST_IGNORES)
    expect(new Set(schemaIgnores).size).toBe(schemaIgnores.length)
    const missing = schemaIgnores.filter(relativePath => !existsSync(join(repoRoot, relativePath)))
    expect(missing).toEqual([])
  })
})
