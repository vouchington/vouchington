import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { readCanonicalMarkdownChildren } from './canonical-markdown-children.mts'

const ROOT_FILE = 'docs/parent.md'

describe('canonical Markdown child fragments', () => {
  const testDirs: string[] = []

  afterEach(() => {
    for (const dir of testDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  function compose(rootContent: string): { content: string; errors: string[] } {
    const repoRoot = mkdtempSync(join(tmpdir(), 'voucha-canonical-markdown-fragment-'))
    testDirs.push(repoRoot)
    const childPath = join(repoRoot, 'docs/child.md')
    mkdirSync(dirname(childPath), { recursive: true })
    writeFileSync(childPath, 'Child content.')
    const errors: string[] = []
    const composition = readCanonicalMarkdownChildren(
      repoRoot,
      ROOT_FILE,
      rootContent,
      [ROOT_FILE, 'docs/child.md'],
      new Map(),
      errors,
    )
    return { content: composition.content, errors }
  }

  it('rejects a canonical child linked only through a fragment', () => {
    const { content, errors } = compose(
      '- <a id="child-mechanics"></a>[Child mechanics](child.md#mechanics)',
    )

    expect(content).not.toContain('Child content.')
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'canonical child child.md is linked only by a fragment; add a whole-file Markdown link for composition',
        ),
      ]),
    )
  })

  it('allows a fragment link when the same child has a whole-file canonical link', () => {
    const { content, errors } = compose(
      '- <a id="child"></a>[Child](child.md)\n- <a id="child-mechanics"></a>[Child mechanics](child.md#mechanics)',
    )

    expect(content).toContain('Child content.')
    expect(errors).toEqual([])
  })

  it('reads a canonical child linked with its descriptive title', () => {
    const { content, errors } = compose('- <a id="child-reference"></a>[Child reference](child.md)')

    expect(errors).toEqual([])
    expect(content).toBe('Child content.')
  })

  it('reads a CRLF-terminated canonical index entry', () => {
    const { content, errors } = compose(
      '- <a id="child-reference"></a>[Child reference](child.md)\r\n',
    )

    expect(errors).toEqual([])
    expect(content).toBe('Child content.\r\n')
  })

  it('leaves prose, external, and query-bearing Markdown links untouched', () => {
    const { content, errors } = compose(
      'See [Related guide](child.md).\n- [External guide](https://example.com/guide.md)\n- [Child guide](child.md?view=full)',
    )

    expect(errors).toEqual([])
    expect(content).toContain('See [Related guide](child.md).')
    expect(content).toContain('https://example.com/guide.md')
    expect(content).toContain('child.md?view=full')
  })

  it('does not let an ordinary prose link satisfy a fragment-only child contract', () => {
    const { content, errors } = compose(
      'See [Related guide](child.md).\n- <a id="child-mechanics"></a>[Child mechanics](child.md#mechanics)',
    )

    expect(content).not.toContain('Child content.')
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('canonical child child.md is linked only by a fragment'),
      ]),
    )
  })

  it('does not treat ordinary bullets, tables, images, or trailing prose as canonical entries', () => {
    const { content, errors } = compose(
      [
        'See also:',
        '- [Related guide](child.md)',
        '| Guide | Link |',
        '| --- | --- |',
        '| Child | [Child](child.md) |',
        '- ![Child image](child.md)',
        '- <a id="child-mechanics"></a>[Child mechanics](child.md#mechanics) trailing prose',
        '## Contents',
        '- <a id="child"></a>[Child](child.md)',
      ].join('\n'),
    )

    expect(errors).toEqual([])
    expect(content).toContain('See also:\n- [Related guide](child.md)')
    expect(content).toContain('| Child | [Child](child.md) |')
    expect(content).toContain('- ![Child image](child.md)')
    expect(content).toContain('trailing prose')
    expect(content).toContain('Child content.')
  })

  it('normalizes equivalent whole-file and fragment targets', () => {
    const { content, errors } = compose(
      '- <a id="child"></a>[Child](./child.md)\n- <a id="child-mechanics"></a>[Child mechanics](child.md#mechanics)',
    )

    expect(content).toContain('Child content.')
    expect(errors).toEqual([])
  })

  it('preserves inline-code compatibility fragments on reorganized indexes', () => {
    const typeScriptStandards = readFileSync(
      'docs/overview/architecture/typescript-standards.md',
      'utf8',
    )

    expect(typeScriptStandards).toContain('id="serializedt--datestring-conversion"')
    expect(typeScriptStandards).not.toContain('id="serialized--datestring-conversion"')
  })

  it('keeps API README index entries ahead of performance guidance', () => {
    const apiReadmes = [
      'backend/api/v1/communities/README.md',
      'backend/api/v1/hostnames/README.md',
      'backend/api/v1/my/README.md',
      'backend/api/v1/posts/README.md',
      'backend/api/v1/rss-feeds/README.md',
      'backend/api/v1/sessions-authentication/README.md',
      'backend/api/v1/topics/README.md',
      'backend/api/v1/users/README.md',
    ]

    for (const readme of apiReadmes) {
      const content = readFileSync(readme, 'utf8')
      const contents = content.indexOf('## Contents')
      const related = content.indexOf('<a id="related"></a>')
      const performance = content.indexOf('## Performance')

      expect(contents).toBeGreaterThanOrEqual(0)
      expect(related).toBeGreaterThan(contents)
      expect(performance).toBeGreaterThan(related)
      expect(content.slice(performance)).toContain('[Performance](reference-performance.md)')
    }
  })
})
