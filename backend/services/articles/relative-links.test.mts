import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { renderMarkdownToHtml } from '@services/markdown'

import { parseFrontmatter } from './parse.mts'
import { rewriteRelativeArticleLinks } from './relative-links.mts'

const ARTICLES_DIR = join(import.meta.dirname, '..', '..', '..', 'articles')

describe('rewriteRelativeArticleLinks', () => {
  it('rewrites inline links and keeps the fragment, query, and title', () => {
    expect(
      rewriteRelativeArticleLinks(
        [
          '[Plain](./copyright-and-dmca.md)',
          '[Section](./copyright-and-dmca.md#counter-notice)',
          '[Query](./cookie-policy.md?ref=x)',
          '[Titled](./privacy-policy.md "Privacy")',
          '[Bracketed](<./terms-of-service.md>)',
          '![Image](./how-to-use-voucha.md)',
        ].join('\n'),
      ),
    ).toBe(
      [
        '[Plain](/article/copyright-and-dmca)',
        '[Section](/article/copyright-and-dmca#counter-notice)',
        '[Query](/article/cookie-policy?ref=x)',
        '[Titled](/article/privacy-policy "Privacy")',
        '[Bracketed](</article/terms-of-service>)',
        '![Image](/article/how-to-use-voucha)',
      ].join('\n'),
    )
  })

  it('rewrites links written without the ./ prefix', () => {
    expect(
      rewriteRelativeArticleLinks(
        '[Bare](for-developers.md) and [Section](for-developers.md#keys)',
      ),
    ).toBe('[Bare](/article/for-developers) and [Section](/article/for-developers#keys)')
  })

  it('rewrites link reference definitions, including the last line of the document', () => {
    expect(
      rewriteRelativeArticleLinks(
        [
          'See [the policy][policy] and [terms].',
          '',
          '[policy]: ./privacy-policy.md',
          '[terms]: ./terms-of-service.md',
        ].join('\n'),
      ),
    ).toBe(
      [
        'See [the policy][policy] and [terms].',
        '',
        '[policy]: /article/privacy-policy',
        '[terms]: /article/terms-of-service',
      ].join('\n'),
    )
  })

  it('leaves code and destinations that are not relative article links as written', () => {
    const untouched = [
      'Inline `[code](./not-a-link.md)` stays.',
      '```md',
      '[fenced](./also-not-a-link.md)',
      '```',
      '[External](https://example.com/guide.md)',
      '[Parent](../docs/guide.md)',
      '[Nested](./nested/guide.md)',
      '[Other type](./guide.txt)',
      '[Absolute](/article/guide)',
      '[Anchor](#guide)',
      'Plain text ./guide.md without a link.',
    ].join('\n')

    expect(rewriteRelativeArticleLinks(untouched)).toBe(untouched)
  })

  it('rewrites a link that follows a closed code block', () => {
    expect(rewriteRelativeArticleLinks('```\n[code](./a.md)\n```\n[real](./b.md)')).toBe(
      '```\n[code](./a.md)\n```\n[real](/article/b)',
    )
  })
})

describe('committed articles', () => {
  it('render no relative .md href and every article link names a committed article', async () => {
    const files = (await readdir(ARTICLES_DIR)).filter(f => f.endsWith('.md') && f !== 'README.md')
    const parsed = await Promise.all(
      files.map(async file => {
        const { frontmatter, body } = parseFrontmatter(
          await readFile(join(ARTICLES_DIR, file), 'utf8'),
        )
        return { file, slug: frontmatter.slug || basename(file, '.md'), body }
      }),
    )
    const slugs = new Set(parsed.map(article => article.slug))

    const offenders: string[] = []
    for (const { file, body } of parsed) {
      const html = await renderMarkdownToHtml(rewriteRelativeArticleLinks(body), {
        allowHtml: true,
      })
      for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href!)) continue
        const path = href!.split(/[?#]/)[0]!
        if (path.endsWith('.md')) offenders.push(`${file}: ${href}`)
        const articleSlug = /^\/article\/([^/]+)$/.exec(path)?.[1]
        if (articleSlug && !slugs.has(articleSlug)) offenders.push(`${file}: ${href} (no article)`)
      }
    }

    expect(offenders).toEqual([])
  })
})
