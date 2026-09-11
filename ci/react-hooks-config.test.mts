import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

const recommendedNativeReactCompilerRules = [
  'react/error-boundaries',
  'react/globals',
  'react/immutability',
  'react/incompatible-library',
  'react/preserve-manual-memoization',
  'react/purity',
  'react/refs',
  'react/set-state-in-effect',
  'react/set-state-in-render',
  'react/static-components',
  'react/unsupported-syntax',
  'react/use-memo',
  'react/void-use-memo',
] as const

const categoryInheritedOffNativeReactCompilerRules = [
  'react/capitalized-calls',
  'react/exhaustive-effect-dependencies',
  'react/hooks',
  'react/memo-dependencies',
  'react/no-deriving-state-in-effects',
] as const

const nativeReactCompilerRules = [
  ...recommendedNativeReactCompilerRules,
  ...categoryInheritedOffNativeReactCompilerRules,
] as const

const nativeReactCompilerRulePattern = nativeReactCompilerRules
  .map(rule => rule.slice('react/'.length))
  .join('|')

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

function readProductionReactSources(path: string): string[] {
  return readdirSync(`${repoRoot}/${path}`, { withFileTypes: true }).flatMap(entry => {
    const childPath = `${path}/${entry.name}`
    if (entry.isDirectory()) return readProductionReactSources(childPath)
    return /\.(?:js|jsx|mjs|mts|ts|tsx)$/.test(entry.name) ? [readRepoFile(childPath)] : []
  })
}

describe('React hook lint configuration', () => {
  it('enables compiler and hook correctness rules in their intended scopes', () => {
    const reactRules = (
      parseJsonc(readRepoFile('.oxlintrc.react.json')) as { rules: Record<string, unknown> }
    ).rules
    const webRules = (
      parseJsonc(readRepoFile('web/.oxlintrc.json')) as { rules: Record<string, unknown> }
    ).rules

    const root = parseJsonc(readRepoFile('.oxlintrc.json')) as {
      jsPlugins: Array<string | { name?: string; specifier?: string }>
      rules: Record<string, unknown>
    }

    expect(webRules).not.toHaveProperty('react/react-compiler')
    for (const rule of recommendedNativeReactCompilerRules) {
      expect(webRules[rule]).toBe('error')
      expect(reactRules[rule]).toBe('error')
      expect(root.rules[rule]).toBe('off')
    }
    for (const rule of categoryInheritedOffNativeReactCompilerRules) {
      expect(webRules[rule]).toBe('off')
      expect(reactRules[rule]).toBe('off')
      expect(root.rules[rule]).toBe('off')
    }
    expect(reactRules).not.toHaveProperty('react-hooks-js/void-use-memo')
    expect(reactRules).not.toHaveProperty('react-hooks-js/error-boundaries')
    expect(reactRules).not.toHaveProperty('react-hooks-js/config')
    expect(reactRules).not.toHaveProperty('react-hooks-js/gating')
    expect(reactRules).not.toHaveProperty('react-hooks-js/component-hook-factories')
    expect(reactRules).not.toHaveProperty('react-hooks-js/rules-of-hooks')
    expect(root.jsPlugins).not.toContainEqual(
      expect.objectContaining({ specifier: 'eslint-plugin-react-hooks' }),
    )
    for (const rule of [
      'react-doctor/no-async-effect-callback',
      'react-doctor/no-create-ref-in-function-component',
      'react-doctor/no-mutating-reducer-state',
      'react-doctor/no-self-updating-effect',
    ]) {
      expect(webRules[rule]).toBe('error')
      expect(reactRules).not.toHaveProperty(rule)
    }
    for (const rule of [
      'react-doctor/effect-needs-cleanup',
      'react-doctor/nextjs-no-client-side-redirect',
      'react-doctor/prefer-useReducer',
      'react-doctor/no-array-index-as-key',
      'react-doctor/design-no-vague-button-label',
    ]) {
      expect(root.rules).not.toHaveProperty(rule)
      expect(reactRules[rule]).toBe('error')
    }
    for (const rule of [
      'react-doctor/js-hoist-intl',
      'react-doctor/raw-sql-injection-risk',
      'react-doctor/jwt-insecure-verification',
      'react-doctor/no-eval',
    ]) {
      expect(root.rules[rule]).toBe('error')
      expect(reactRules).not.toHaveProperty(rule)
    }
  })

  it('allows no native compiler or JS hook suppressions', () => {
    const sources = [
      ...readProductionReactSources('web/app'),
      ...readProductionReactSources('web/components'),
      ...readProductionReactSources('web/hooks'),
      ...readProductionReactSources('web/lib'),
    ].join('\n')

    const nativeCompilerDisables =
      sources.match(
        new RegExp(
          String.raw`(?:oxlint|eslint)-disable[^\n]*react\/(?:react-compiler|${nativeReactCompilerRulePattern})\b[^\n]*`,
          'g',
        ),
      ) ?? []
    expect(nativeCompilerDisables).toHaveLength(0)
    expect(sources).not.toMatch(/(?:oxlint|eslint)-disable[^\n]*react-hooks-js\//)
  })
})
