import { describe, expect, it } from 'vitest'
import { workflowYamlPaths, yamlSource } from './pnpm-policy.test-helpers.mts'

describe('pnpm activation via corepack (not pnpm/action-setup)', () => {
  const allFiles = workflowYamlPaths

  it('no file uses pnpm/action-setup — corepack replaces it everywhere', () => {
    const offenders = allFiles.filter(path => yamlSource(path).includes('pnpm/action-setup'))
    expect(offenders).toEqual([])
  })

  // Files with the pnpm activation block (uses node_bin path for corepack or npm fallback).
  const filesWithPnpmActivation = allFiles.filter(path =>
    yamlSource(path).includes('node_bin="$(dirname'),
  )

  it('has at least one file with pnpm activation', () => {
    expect(filesWithPnpmActivation.length).toBeGreaterThan(0)
  })

  for (const file of filesWithPnpmActivation) {
    it(`${file}: pnpm activation follows actions/setup-node`, () => {
      const content = yamlSource(file)
      const nodeIdx = content.indexOf('actions/setup-node@')
      const activationIdx = content.indexOf('node_bin="$(dirname')
      expect(nodeIdx).toBeGreaterThan(-1)
      expect(activationIdx).toBeGreaterThan(-1)
      expect(nodeIdx).toBeLessThan(activationIdx)
    })

    it(`${file}: uses corepack or npm to install the pinned pnpm version`, () => {
      const content = yamlSource(file)
      expect(content).toContain('pnpm_version=')
      expect(content).toContain('GITHUB_PATH')
    })

    it(`${file}: Node version is asserted to be v26.x before pnpm activation`, () => {
      const content = yamlSource(file)
      expect(content).toContain('node --version')
      expect(content).toContain('v26.*)')
    })

    it(`${file}: includes manual nodejs.org download fallback before the version guard`, () => {
      const content = yamlSource(file)
      expect(content).toContain('nodejs.org/dist/latest-v')
      expect(content).toMatch(/sha256sum -c|shasum -a 256 -c/)
      const fallbackIdx = content.indexOf('nodejs.org/dist/latest-v')
      const guardIdx = content.indexOf('v26.*)')
      expect(fallbackIdx).toBeGreaterThan(-1)
      expect(fallbackIdx).toBeLessThan(guardIdx)
      expect(content).not.toContain('RUNNER_TOOL_CACHE')
    })
  }
})
