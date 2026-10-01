import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

interface Config {
  extends?: string[]
  plugins?: string[] | null
  jsPlugins?: Array<string | { name: string; specifier: string }>
  rules?: Record<string, unknown>
  overrides?: Config[]
}

const oxlint = resolve('node_modules/.bin/oxlint')
const tracked = spawnSync('git', ['ls-files', '-z', '.oxlintrc*.json', '**/.oxlintrc*.json'], {
  encoding: 'utf8',
})
if (tracked.status !== 0) throw new Error(`${tracked.error?.message ?? ''}\n${tracked.stderr}`)
const configPaths = tracked.stdout
  .split('\0')
  .filter(path => /(?:^|\/)\.oxlintrc(?:\.[^/]+)?\.json$/.test(path))

function readConfig(path: string): Config {
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'))
  if (parsed.error) throw new Error(`Cannot parse ${path}`)
  return parsed.config as Config
}

function ancestors(path: string): Config[] {
  const config = readConfig(path)
  return [
    ...(config.extends ?? []).flatMap(parent => ancestors(resolve(dirname(path), parent))),
    config,
  ]
}

function printConfig(path: string): Config {
  const result = spawnSync(oxlint, ['--print-config', '--config', path], {
    encoding: 'utf8',
    timeout: 20_000,
  })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
  return JSON.parse(result.stdout) as Config
}

function missingPlugins(configs: Config[], effective: Config): string[] {
  const jsAliases = new Set(
    configs.flatMap(config =>
      (config.jsPlugins ?? []).map(plugin =>
        typeof plugin === 'string' ? plugin.replace(/^eslint-plugin-/, '') : plugin.name,
      ),
    ),
  )
  const rules = Object.assign({}, ...configs.map(config => config.rules ?? {})) as Record<
    string,
    unknown
  >
  const scopes = [
    { rules, plugins: effective.plugins },
    ...configs.flatMap(config =>
      (config.overrides ?? []).map(override => ({
        rules: override.rules ?? {},
        plugins: override.plugins ?? effective.plugins,
      })),
    ),
  ]
  return scopes
    .flatMap(scope =>
      Object.keys(scope.rules).flatMap(rule => {
        const separator = rule.lastIndexOf('/')
        if (separator === -1) return []
        const namespace = rule.slice(0, separator).replace(/^@typescript-eslint$/, 'typescript')
        if (jsAliases.has(namespace) || scope.plugins?.includes(namespace)) return []
        return [rule]
      }),
    )
    .toSorted()
}

describe('configured builtin Oxlint plugins', () => {
  // Shared fragments are exercised through their concrete consumers, which supply plugins.
  const concreteConfigs = configPaths.filter(
    path => path.endsWith('/.oxlintrc.json') || path === '.oxlintrc.json',
  )

  it.each(concreteConfigs)('loads the plugin for every configured builtin rule in %s', path => {
    const configs = ancestors(resolve(path))
    const effective = printConfig(resolve(path))
    const missing = missingPlugins(configs, effective)
    expect({ path, missing }).toEqual({
      path,
      missing: [],
    })
  })

  it('checks override plugin replacements and inherited plugin defaults', () => {
    const rule = 'unicorn/no-array-for-each'
    const config: Config = { overrides: [{ rules: { [rule]: 'error' } }] }
    expect(missingPlugins([config], { plugins: ['unicorn'] })).toEqual([])
    config.overrides = [{ plugins: [], rules: { [rule]: 'error' } }]
    expect(missingPlugins([config], { plugins: ['unicorn'] })).toEqual([rule])
  })

  it('distinguishes registered JavaScript plugin aliases from builtin namespaces', () => {
    const config: Config = {
      jsPlugins: [
        'eslint-plugin-example',
        { name: 'custom-alias', specifier: 'eslint-plugin-other' },
      ],
      rules: {
        'example/rule': 'error',
        'custom-alias/rule': 'error',
        'unicorn/no-array-for-each': 'error',
      },
    }
    expect(missingPlugins([config], { plugins: ['unicorn'] })).toEqual([])
    expect(missingPlugins([config], { plugins: [] })).toEqual(['unicorn/no-array-for-each'])
  })

  it.each(['off', 0, ['off']] as const)(
    'checks plugins even for disabled rule setting %j',
    setting => {
      const config: Config = { rules: { 'unicorn/no-array-for-each': setting } }
      expect(missingPlugins([config], { plugins: [] })).toEqual(['unicorn/no-array-for-each'])
    },
  )

  it('detects an inherited rule whose plugin is missing from the extends chain', () => {
    const directory = mkdtempSync(join(tmpdir(), 'voucha-inherited-plugin-'))
    const parent = join(directory, 'parent.json')
    const child = join(directory, '.oxlintrc.json')
    const rule = 'unicorn/no-array-for-each'
    try {
      writeFileSync(parent, JSON.stringify({ plugins: ['unicorn'], rules: { [rule]: 'error' } }))
      writeFileSync(child, JSON.stringify({ extends: ['./parent.json'], plugins: ['unicorn'] }))
      expect(missingPlugins(ancestors(child), printConfig(child))).toEqual([])
      writeFileSync(parent, JSON.stringify({ plugins: [], rules: { [rule]: 'error' } }))
      writeFileSync(child, JSON.stringify({ extends: ['./parent.json'], plugins: [] }))
      expect(missingPlugins(ancestors(child), printConfig(child))).toEqual([rule])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each([
    { plugin: 'typescript', rule: 'typescript/no-duplicate-enum-values' },
    { plugin: 'unicorn', rule: 'unicorn/no-array-for-each' },
    { plugin: 'promise', rule: 'promise/no-return-wrap' },
  ])('detects silently omitted $plugin rules using the installed analyzer', ({ plugin, rule }) => {
    const directory = mkdtempSync(join(tmpdir(), 'voucha-configured-plugins-'))
    const path = join(directory, '.oxlintrc.json')
    try {
      const config: Config = { plugins: [plugin], rules: { [rule]: 'error' } }
      writeFileSync(path, JSON.stringify(config))
      expect(missingPlugins([config], printConfig(path))).toEqual([])
      config.plugins = []
      writeFileSync(path, JSON.stringify(config))
      expect(missingPlugins([config], printConfig(path))).toEqual([rule])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
