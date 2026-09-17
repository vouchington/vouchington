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

  it('always sets package-manager-cache: false', () => {
    for (const { path, block } of allBlocks) {
      expect([path, block.includes('package-manager-cache: false')]).toEqual([path, true])
    }
  })
})
