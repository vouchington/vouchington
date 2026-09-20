import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('component story ratchet a11y contract', () => {
  const storybookDirectory = resolve(import.meta.dirname, '..')
  const ratchetStoryFiles = readdirSync(storybookDirectory)
    .filter(file => /^component-story-ratchet-part-\d+\.stories\.tsx$/.test(file))
    .map(file => ({
      file,
      source: readFileSync(resolve(storybookDirectory, file), 'utf8'),
    }))
  const ratchetSourceFiles = [
    ...ratchetStoryFiles,
    {
      file: 'component-story-ratchet-parameters.ts',
      source: readFileSync(
        resolve(storybookDirectory, 'component-story-ratchet-parameters.ts'),
        'utf8',
      ),
    },
  ]

  it('uses enforced accessibility parameters for every CoveragePart story', () => {
    expect(ratchetStoryFiles).toHaveLength(15)

    for (const { file, source } of ratchetStoryFiles) {
      expect({
        file,
        usesEnforcedParameters:
          /export const CoveragePart\d+: Story = \{\s+parameters: componentStoryRatchetParameters,/.test(
            source,
          ),
      }).toEqual({ file, usesEnforcedParameters: true })
    }
  })

  it('has no pending-fixture stories or accessibility-off boundaries', () => {
    for (const { file, source } of ratchetSourceFiles) {
      expect({ file, hasPendingExport: /A11yPendingFixturesPart\d+/.test(source) }).toEqual({
        file,
        hasPendingExport: false,
      })
      expect({
        file,
        hasPendingHelper: source.includes('pendingFixtureComponentStoryRatchetParameters'),
      }).toEqual({ file, hasPendingHelper: false })
      expect({ file, hasPendingArray: /pendingFixtureComponentsPart\d+/.test(source) }).toEqual({
        file,
        hasPendingArray: false,
      })
      expect({ file, hasA11yOff: /a11y:\s*\{\s*test:\s*['"]off['"]/.test(source) }).toEqual({
        file,
        hasA11yOff: false,
      })
    }
  })
})
