import { describe, expect, it } from 'vitest'
import { computeKey } from './key-scheme.mts'
import { rewriteFile } from './rewrite.mts'

describe('rewriteFile — JSX text (regression: full replacement, not append)', () => {
  it('replaces an indented JSX text child entirely, leaving no residual source text behind', () => {
    const filePath = 'web/components/comments/comment-node-actions.tsx'
    const source = `'use client'
import { Link } from '@/components/ui/link'

export function CommentNodeActions() {
  return (
    <Link href="/x">
      Permalink
    </Link>
  )
}
`
    const result = rewriteFile(filePath, source)
    const { fullKey } = computeKey(filePath, 'Permalink')

    expect(result.changed).toBe(true)
    expect(result.entries).toEqual([{ fullKey, normalizedText: 'Permalink' }])
    // The bug this guards against: an earlier off-by-one in the JSX-text range computation
    // spliced `{t(...)}` in the middle of the original text instead of replacing it (e.g.
    // `Permali{t(...)}nk`). Asserting the *exact* surrounding text — not just "the old string is
    // gone somewhere" — is what actually catches that: a stray leftover fragment like `Permali` or
    // `nk` would fail this exact match, whereas a bare `not.toContain('Permalink')` would not (the
    // split string no longer reads as one contiguous substring either way).
    expect(result.newText).toContain(`<Link href="/x">\n      {t('${fullKey}')}\n    </Link>`)
  })

  it('replaces a single-line (non-indented) JSX text child entirely', () => {
    const filePath = 'web/components/comments/comment-permalink.tsx'
    const source = `'use client'

export function CommentPermalink() {
  return <span>Hello world</span>
}
`
    const result = rewriteFile(filePath, source)
    const { fullKey } = computeKey(filePath, 'Hello world')

    expect(result.newText).toContain(`<span>{t('${fullKey}')}</span>`)
  })
})

describe('rewriteFile — JSX attributes', () => {
  it('replaces a bare string-literal placeholder entirely', () => {
    const filePath = 'web/components/messages/recipient-picker.tsx'
    const source = `'use client'

export function RecipientPicker() {
  return <input placeholder="Search users…" />
}
`
    const result = rewriteFile(filePath, source)
    const { fullKey } = computeKey(filePath, 'Search users…')

    expect(result.newText).toContain(`placeholder={t('${fullKey}')}`)
  })
})

describe('rewriteFile — toast calls', () => {
  it('replaces a string-literal onSuccess argument with a bare t() call (no braces)', () => {
    const filePath = 'web/components/comments/comment-reply-form.tsx'
    const source = `'use client'

export function CommentReplyForm() {
  function handleSave() {
    onSuccess('Saved successfully')
  }
  return <div />
}
`
    const result = rewriteFile(filePath, source)
    const { fullKey } = computeKey(filePath, 'Saved successfully')

    expect(result.newText).toContain(`onSuccess(t('${fullKey}'))`)
  })

  it('replaces a string-literal onError fallback property in place, leaving sibling properties untouched', () => {
    const filePath = 'web/components/comments/delete-comment-button.tsx'
    const source = `'use client'

export function DeleteCommentButton() {
  function handleDelete() {
    onError(error, { fallback: 'Failed to delete comment', tags: { form: 'comment-delete' } })
  }
  return <div />
}
`
    const result = rewriteFile(filePath, source)
    const { fullKey } = computeKey(filePath, 'Failed to delete comment')

    expect(result.newText).toContain(
      `onError(error, { fallback: t('${fullKey}'), tags: { form: 'comment-delete' } })`,
    )
  })
})

describe('rewriteFile — binding + import injection', () => {
  it('injects useTranslations() and its import for a client-mode component with no existing binding', () => {
    const filePath = 'web/components/comments/comment-permalink.tsx'
    const source = `'use client'
import { Link } from '@/components/ui/link'

export function CommentPermalink() {
  return <span>Hello world</span>
}
`
    const result = rewriteFile(filePath, source)

    expect(result.newText).toContain(
      "import { useTranslations } from '@/lib/i18n/use-translations'",
    )
    expect(result.newText).toContain(
      'export function CommentPermalink() {\n  const t = useTranslations()\n',
    )
  })

  it('injects getTranslations() and its import for an already-async server component', () => {
    const filePath = 'web/app/(my)/my/data/page.tsx'
    const source = `export async function DataPage() {
  return <span>Hello world</span>
}
`
    const result = rewriteFile(filePath, source)

    expect(result.newText).toContain(
      "import { getTranslations } from '@/lib/i18n/get-translations'",
    )
    expect(result.newText).toContain(
      'export async function DataPage() {\n  const t = await getTranslations()\n',
    )
  })

  it('reuses an existing local "t" binding instead of injecting a second one or an import', () => {
    const filePath = 'web/components/comments/comment-permalink.tsx'
    const source = `'use client'

export function CommentPermalink() {
  const t = useTranslations()
  return <span>Hello world</span>
}
`
    const result = rewriteFile(filePath, source)

    expect(result.newText).not.toContain('use-translations')
    expect((result.newText.match(/const t = useTranslations\(\)/g) ?? []).length).toBe(1)
  })
})

describe('rewriteFile — no-op cases', () => {
  it('leaves a file with no extraction targets byte-identical and reports changed: false', () => {
    const filePath = 'web/components/comments/comment-permalink.tsx'
    const source = `'use client'

export function CommentPermalink() {
  return <span>{dynamicValue}</span>
}
`
    const result = rewriteFile(filePath, source)

    expect(result.changed).toBe(false)
    expect(result.newText).toBe(source)
    expect(result.entries).toEqual([])
  })
})

describe('rewriteFile — determinism (Stage B correctness gate)', () => {
  it('re-running rewriteFile over its own already-rewritten output finds zero further targets', () => {
    const filePath = 'web/components/comments/comment-permalink.tsx'
    const source = `'use client'

export function CommentPermalink() {
  return <span>Hello world</span>
}
`
    const first = rewriteFile(filePath, source)
    const second = rewriteFile(filePath, first.newText)

    expect(second.changed).toBe(false)
    expect(second.entries).toEqual([])
    expect(second.newText).toBe(first.newText)
  })
})
