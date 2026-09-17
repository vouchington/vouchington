import { describe, expect, it } from 'vitest'
import { actionStepBlocks, workflowYamlPaths, yamlSource } from './pnpm-policy.test-helpers.mts'

const allBlocks: Array<{ path: string; block: string }> = workflowYamlPaths.flatMap(path =>
  actionStepBlocks(yamlSource(path), /uses:\s+actions\/setup-node@/).map(block => ({
    path,
    block,
  })),
)
const unsafeNodeVersionFilePattern = /node-version-file:\s*['"]?(?:\$\{\{|\/)/u

describe('actions/setup-node policy', () => {
  const trustedDirectCodexPaths = new Set([
    '.github/workflows/harness-dispatch.yml',
    '.github/workflows/fix-main.yml',
    '.github/workflows/shepherd.yml',
  ])

  it('has at least one setup-node call site to validate', () => {
    expect(allBlocks.length).toBeGreaterThan(0)
  })

  it('always pins to v6 or higher', () => {
    for (const { path, block } of allBlocks) {
      const taggedMajor = /uses:\s+actions\/setup-node@v(\d+)/.exec(block)?.[1]
      const shaProvenanceMajor = /uses:\s+actions\/setup-node@[0-9a-f]{40}\s+#\s+v(\d+)/.exec(
        block,
      )?.[1]
      const major = Number(taggedMajor ?? shaProvenanceMajor ?? -1)
      expect([path, major >= 6]).toEqual([path, true])
    }
  })

  it('uses .nvmrc except for the trusted direct-Codex runtime', () => {
    for (const { path, block } of allBlocks) {
      const validVersionSource = trustedDirectCodexPaths.has(path)
        ? block.includes("node-version: '26'") && !block.includes('node-version-file:')
        : block.includes("node-version-file: '.nvmrc'")
      expect([path, validVersionSource]).toEqual([path, true])
    }
  })

  it('rejects absolute and expression-based node-version-file inputs', () => {
    for (const { path, block } of allBlocks) {
      expect([path, unsafeNodeVersionFilePattern.test(block)]).toEqual([path, false])
    }
  })

  it.each([
    'node-version-file: /trusted/.nvmrc',
    'node-version-file: ${{ github.action_path }}/../../../.nvmrc',
    "node-version-file: '${{ github.action_path }}/../../../.nvmrc'",
    'node-version-file: "${{ github.action_path }}/../../../.nvmrc"',
  ])('recognizes an unsafe version-file example: %s', source => {
    expect(unsafeNodeVersionFilePattern.test(source)).toBe(true)
  })

  it('uses node-version only for the trusted direct-Codex runtime', () => {
    for (const { path, block } of allBlocks) {
      const validLiteralVersion = trustedDirectCodexPaths.has(path)
        ? block.includes("node-version: '26'")
        : !/^\s+node-version:/m.test(block)
      expect([path, validLiteralVersion]).toEqual([path, true])
    }
  })

  it('always sets package-manager-cache: false, unless it replaces the setting with its own correctly-keyed pnpm store cache', () => {
    // package-manager-cache: false is defense-in-depth against setup-node's built-in cache: it is
    // already a no-op for this pnpm-only repo (setup-node only auto-caches when package.json's
    // packageManager is npm; see cache-policy.test.mts's "never enables npm package manager caches"
    // for the real functional guard). That makes it a residual once a caller adds its own real,
    // explicit, correctly-keyed pnpm store cache -- carrying the dead literal forward too would be
    // exactly the kind of residual CLAUDE.md bans (issue #46).
    for (const { path, block } of allBlocks) {
      const source = yamlSource(path)
      const hasOwnPnpmStoreCache =
        source.includes('pnpm store path --silent') &&
        /key:\s*pnpm-store-.*hashFiles\('pnpm-lock\.yaml'\)/.test(source)
      const satisfiesPolicy = block.includes('package-manager-cache: false') || hasOwnPnpmStoreCache
      expect([path, satisfiesPolicy]).toEqual([path, true])
    }
  })
})
