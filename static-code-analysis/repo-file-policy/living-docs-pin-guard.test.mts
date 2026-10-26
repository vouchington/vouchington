import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkLivingDocsPinGuard } from './living-docs-pin-guard.mts'

describe('living docs pin guard', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  function check(files: Record<string, string>, tracked = Object.keys(files)): string[] {
    const root = mkdtempSync(join(tmpdir(), 'living-docs-pin-'))
    roots.push(root)
    for (const [path, content] of Object.entries(files)) {
      const absolute = join(root, path)
      mkdirSync(dirname(absolute), { recursive: true })
      writeFileSync(absolute, content)
    }
    const errors: string[] = []
    checkLivingDocsPinGuard(root, tracked, errors)
    return errors
  }

  it('rejects copied pins only in the configured living docs', () => {
    expect(
      check({
        'docs/development/reference-dependency-updates-manually-maintained-pins.md': `Current SHA\n| \`abcdef1234567890\` |\n${'a'.repeat(64)}`,
        'docs/development/dependency-updates.md': 'Canonical pin policy',
        'docs/development/system-dependencies.md': 'build-tools;1.2.3',
        '.agents/skills/agent-workflow/implementation.md':
          'tool version pin in `.mise.toml`, update the corresponding doc',
      }),
    ).toEqual([
      expect.stringContaining('Current SHA'),
      expect.stringContaining('abcdef1234567890'),
      expect.stringContaining('a'.repeat(64)),
      expect.stringContaining('build-tools;1.2.3'),
      expect.stringContaining('tool version pin in'),
    ])
  })

  it('allows owner links and requires each configured page to remain tracked', () => {
    expect(
      check(
        {
          'docs/development/dependency-updates.md': 'Canonical pin policy',
          'docs/development/reference-dependency-updates-manually-maintained-pins.md':
            'See the owner file for current pins.',
          'docs/development/system-dependencies.md': 'See dependency policy.',
          '.agents/skills/agent-workflow/implementation.md': 'See dependency policy.',
        },
        ['docs/development/dependency-updates.md'],
      ),
    ).toEqual([
      expect.stringContaining(
        'reference-dependency-updates-manually-maintained-pins.md: living-docs pin policy page is not tracked',
      ),
      expect.stringContaining('system-dependencies.md: living-docs pin policy page is not tracked'),
      expect.stringContaining(
        'agent-workflow/implementation.md: living-docs pin policy page is not tracked',
      ),
    ])
  })

  it('allows tracked pages that point back to their owners without copied pin values', () => {
    expect(
      check({
        'docs/development/dependency-updates.md': 'Canonical pin policy',
        'docs/development/reference-dependency-updates-manually-maintained-pins.md':
          'See the owner file for current pins.',
        'docs/development/system-dependencies.md': 'See dependency policy.',
        '.agents/skills/agent-workflow/implementation.md': 'See dependency policy.',
      }),
    ).toEqual([])
  })

  it('ignores pin-shaped text outside the configured living docs', () => {
    expect(check({ 'docs/overview/example.md': 'Current SHA\n| `abcdef1234567890` |' })).toEqual([])
  })

  it('reports a tracked configured page that is missing on disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'living-docs-pin-'))
    roots.push(root)
    const errors: string[] = []
    checkLivingDocsPinGuard(root, ['docs/development/system-dependencies.md'], errors)
    expect(errors).toEqual([
      expect.stringContaining(
        'system-dependencies.md: living-docs pin policy page is missing on disk',
      ),
    ])
  })
})
