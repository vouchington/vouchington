import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkSplitMarkdownCanonicalLinkGuard } from './split-markdown-canonical-link-guard.mts'

describe('split Markdown canonical link guard', () => {
  const testDirs: string[] = []

  afterEach(() => {
    for (const dir of testDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  function check(files: Record<string, string>): string[] {
    const repoRoot = mkdtempSync(join(tmpdir(), 'voucha-split-markdown-link-guard-'))
    testDirs.push(repoRoot)
    for (const [path, content] of Object.entries(files)) {
      const file = join(repoRoot, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, content)
    }
    const errors: string[] = []
    checkSplitMarkdownCanonicalLinkGuard(repoRoot, Object.keys(files), errors)
    return errors
  }

  it('rejects a fragment-only canonical child in a #8739 split parent', () => {
    const errors = check({
      'docs/requirements/trust-safety/trust-system.md':
        '- <a id="overview-mechanics"></a>[Overview mechanics](reference-overview.md#mechanics)',
    })

    expect(errors).toEqual([
      expect.stringContaining(
        'canonical child reference-overview.md is linked only by a fragment; add a whole-file Markdown link for composition',
      ),
    ])
  })

  it('rejects a fragment-only canonical child in a #8738 split parent', () => {
    const errors = check({
      'docs/requirements/ADMIN-NAVIGATION-MATRIX.md':
        '- <a id="admin-navigation-staff"></a>[Admin navigation staff](reference-admin-navigation.md#staff)',
    })

    expect(errors).toEqual([
      expect.stringContaining(
        'canonical child reference-admin-navigation.md is linked only by a fragment; add a whole-file Markdown link for composition',
      ),
    ])
  })

  it('allows normalized whole-file and fragment targets in a split parent', () => {
    const errors = check({
      'docs/requirements/trust-safety/trust-system.md':
        '- <a id="overview"></a>[Overview](./reference-overview.md)\n- <a id="overview-mechanics"></a>[Overview mechanics](reference-overview.md#mechanics)',
    })

    expect(errors).toEqual([])
  })

  it('does not apply the split-parent contract to unrelated Markdown files', () => {
    const errors = check({
      'docs/overview/architecture/example.md':
        '- <a id="overview-mechanics"></a>[Overview mechanics](reference-overview.md#mechanics)',
    })

    expect(errors).toEqual([])
  })
})
