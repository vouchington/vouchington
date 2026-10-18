import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'

import {
  categoryInheritedOffNativeReactCompilerRules,
  forbiddenReactHookSuppressions,
  recommendedNativeReactCompilerRules,
} from './react-hooks-suppression-policy.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
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

  it('detects native and legacy hook suppressions without flagging unrelated comments', () => {
    expect(
      forbiddenReactHookSuppressions(
        [
          '// oxlint-disable react/purity',
          '// eslint-disable react/react-compiler',
          '// oxlint-disable react-hooks-js/rules-of-hooks',
        ].join('\n'),
      ),
    ).toEqual([
      'oxlint-disable react/purity',
      'eslint-disable react/react-compiler',
      'oxlint-disable react-hooks-js/',
    ])
    expect(forbiddenReactHookSuppressions('// oxlint-disable typescript/no-explicit-any')).toEqual(
      [],
    )
  })
})
