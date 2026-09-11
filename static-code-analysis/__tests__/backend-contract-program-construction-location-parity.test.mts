import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse as yamlLoad } from 'yaml'

const require = createRequire(import.meta.url)
const { FACTORIES } = require('../oxlint-plugin/typescript-program-surface.cjs') as {
  FACTORIES: Set<string>
}
const rule = yamlLoad(
  readFileSync(
    resolve('ast-grep-rules/backend-contract-program-construction-location.yml'),
    'utf8',
  ),
) as { ignores: string[]; rule: unknown; utils: Record<string, unknown> }

function collectFactoryRegexes(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(collectFactoryRegexes)
  const object = value as Record<string, unknown>
  const current =
    typeof object.regex === 'string' && object.regex.includes('readBuilderProgram')
      ? [object.regex]
      : []
  return [...current, ...Object.values(object).flatMap(collectFactoryRegexes)]
}

describe('backend-contract-program-construction-location AST-grep parity', () => {
  it('matches every canonical factory in each manually duplicated syntax arm', () => {
    const factoryRegexes = collectFactoryRegexes(rule.rule)

    expect(factoryRegexes).toHaveLength(6)
    const [
      namedImport,
      dynamicCall,
      createRequireCall,
      dynamicDeclarator,
      dynamicAssignment,
      valueExportSpecifier,
    ] = factoryRegexes.map(regex => new RegExp(regex))
    const candidates = [
      [namedImport, (factory: string) => `${factory} as protectedFactory`],
      [dynamicCall, (factory: string) => `(await import('typescript')).${factory}(`],
      [
        createRequireCall,
        (factory: string) => `createRequire(import.meta.url)('typescript').${factory}(`,
      ],
      [
        dynamicDeclarator,
        (factory: string) => `protectedFactory = (await import('typescript')).${factory}`,
      ],
      [
        dynamicAssignment,
        (factory: string) => `protectedFactory = (await import('typescript')).${factory}`,
      ],
      [valueExportSpecifier, (factory: string) => `${factory} as protectedFactory`],
    ] as const

    for (const [regex, candidate] of candidates) {
      for (const factory of FACTORIES) {
        expect(regex.test(candidate(factory))).toBe(true)
      }
    }
  })

  it('matches quoted value-export names for every canonical factory', () => {
    const valueExportSpecifier = new RegExp(collectFactoryRegexes(rule.rule).at(-1)!)

    for (const factory of FACTORIES) {
      expect(valueExportSpecifier.test(`"${factory}" as protectedFactory`)).toBe(true)
      expect(valueExportSpecifier.test(`'${factory}' as protectedFactory`)).toBe(true)
      expect(valueExportSpecifier.test(`${factory} as "protected-factory"`)).toBe(true)
      expect(valueExportSpecifier.test(`${factory} as 'protected-factory'`)).toBe(true)
    }
  })

  it('matches quoted named imports and generic dynamic calls for every canonical factory', () => {
    const [namedImport, dynamicCall, createRequireCall] = collectFactoryRegexes(rule.rule).map(
      regex => new RegExp(regex),
    )

    for (const factory of FACTORIES) {
      expect(namedImport.test(`"${factory}" as protectedFactory`)).toBe(true)
      expect(dynamicCall.test(`(await import('typescript')).${factory}<ts.Program>(`)).toBe(true)
      expect(
        createRequireCall.test(
          `createRequire(import.meta.url)('typescript').${factory}<ts.Program>(`,
        ),
      ).toBe(true)
    }
  })

  it('matches protected destructuring property keys without matching local bindings', () => {
    const destructureKeyRegexes = collectFactoryRegexes(
      rule.utils['protected-factory-destructure-key'],
    ).map(regex => new RegExp(regex))
    const [shorthandKey, shorthandDefaultKey, pairKey] = destructureKeyRegexes

    expect(destructureKeyRegexes).toHaveLength(3)
    for (const factory of FACTORIES) {
      expect(shorthandKey.test(factory)).toBe(true)
      expect(shorthandDefaultKey.test(factory)).toBe(true)
      expect(pairKey.test(factory)).toBe(true)
      expect(pairKey.test(`"${factory}"`)).toBe(true)
      expect(pairKey.test(`['${factory}']`)).toBe(true)
      expect(pairKey.test(`[\`${factory}\`]`)).toBe(true)
      expect(pairKey.test(`[\`${factory}\${suffix}\`]`)).toBe(false)
      expect(pairKey.test(`SyntaxKind: ${factory}`)).toBe(false)
    }
  })

  it('keeps exactly the TypeScript construction owner ignored', () => {
    expect(rule.ignores).toEqual(['backend/test-helpers/api-fixtures/backend-program.mts'])
  })
})
