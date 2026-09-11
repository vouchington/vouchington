import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// Guard: web/.storybook/vitest.setup.ts must not contain the literal detector strings
// that Storybook uses to detect duplicate project-annotation calls.
//
// When Storybook scans setup files for `setProjectAnnotations`, `Found a setup file`,
// or `Skipping automatic provisioning`, it emits a duplicate-annotation warning and can
// produce double-annotation behaviour. The current file evades detection using a split
// template literal:
//
//   previewApi[`set${'ProjectAnnotations'}`]
//
// If that literal is replaced with the plain form, the bug silently reappears — this test
// is the only machine-checkable guard against regression.
//
// NOTE: this test file intentionally contains the detector strings to describe them.
// The guard scans only web/.storybook/vitest.setup.ts, so this file's content is safe.
describe('storybook setup-file detector guard', () => {
  const setupFile = readFileSync('web/.storybook/vitest.setup.ts', 'utf8')

  it('does not contain the setProjectAnnotations detector literal', () => {
    expect(setupFile).not.toContain('setProjectAnnotations')
  })

  it('does not contain the "Found a setup file" detector string', () => {
    expect(setupFile).not.toContain('Found a setup file')
  })

  it('does not contain the "Skipping automatic provisioning" detector string', () => {
    expect(setupFile).not.toContain('Skipping automatic provisioning')
  })

  it('does not use Vitest module mocks in the browser setup file', () => {
    expect(setupFile).not.toContain('vi.mock')
  })
})
