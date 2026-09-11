import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { astGrepPackPaths } from 'vouchington-tooling/ast-grep-pack'
import { parse as yamlLoad } from 'yaml'
import { withPackRuleDir } from '../ast-grep-pack-config.mts'

const LOCAL_RULES = resolve('ast-grep-rules')
const PACK_RULES = astGrepPackPaths().rules
const SGCONFIG = resolve('sgconfig.yml')
const TSX_GLOBS = ['**/*.ts', '**/*.mts', '**/*.cts', '**/*.tsx']

function yamlFiles(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[]).filter(
    (file): file is string => typeof file === 'string' && /\.ya?ml$/u.test(file),
  )
}

describe('ast-grep Tsx languageGlobs contract', () => {
  it('sgconfig.yml lists only tracked local rules', () => {
    const config = yamlLoad(readFileSync(SGCONFIG, 'utf8')) as { ruleDirs: string[] }
    expect(config.ruleDirs).toEqual(['ast-grep-rules'])
  })

  it('maps script and TSX extensions to Tsx', () => {
    const config = yamlLoad(readFileSync(SGCONFIG, 'utf8')) as {
      languageGlobs: Record<string, string[]>
    }
    expect(config.languageGlobs).toEqual({ Tsx: TSX_GLOBS })
  })

  it('withPackRuleDir prepends the installed pack', () => {
    const packRules = astGrepPackPaths().rules
    expect(withPackRuleDir({ ruleDirs: ['ast-grep-rules'] }, packRules).ruleDirs).toEqual([
      packRules,
      'ast-grep-rules',
    ])
    expect(
      withPackRuleDir({ ruleDirs: [packRules, 'ast-grep-rules'] }, packRules).ruleDirs,
    ).toEqual([packRules, 'ast-grep-rules'])
  })

  it('does not copy pack YAML into local ast-grep-rules', () => {
    const local = new Set(readdirSync(LOCAL_RULES))
    const packFiles = yamlFiles(PACK_RULES)
    expect(packFiles.filter(file => local.has(file))).toEqual([])
  })

  it.each([
    ['local', LOCAL_RULES],
    ['pack', PACK_RULES],
  ] as const)('%s rules are Tsx YAML without -tsx companions', (_label, dir) => {
    const files = yamlFiles(dir)
    expect(files.length).toBeGreaterThan(0)
    expect(files.filter(file => /-tsx\.ya?ml$/u.test(file))).toEqual([])
    for (const file of files) {
      const rule = yamlLoad(readFileSync(resolve(dir, file), 'utf8')) as { language?: string }
      expect({ file, language: rule.language }).toEqual({ file, language: 'Tsx' })
    }
  })
})
