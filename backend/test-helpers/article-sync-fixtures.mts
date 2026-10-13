import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import type { ArticleSyncResult } from '@voucha/types/article-sync'
import { getPostByAny } from '../services/posts/get.mts'
import { withOwnedPostCommitCompletions } from './post-commit-completion.mts'

export function createArticleSyncFixtures() {
  const suffix = randomUUID()
  const aboutSlug = `about-${suffix}`
  const keyboardSlug = `keyboard-shortcuts-${suffix}`
  const articles = new Map([
    [
      'about.md',
      `---\ntitle: About Voucha\nslug: ${aboutSlug}\npost_type: article\n---\n# About Voucha\n\nAbout body.`,
    ],
    [
      'keyboard-shortcuts.md',
      `---\ntitle: Keyboard Shortcuts\nslug: ${keyboardSlug}\npost_type: article\n---\n# Keyboard Shortcuts\n\nShortcut body.`,
    ],
  ])
  return { aboutSlug, keyboardSlug, articles }
}

export async function syncOwnedArticles(
  ownedSlugs: ReadonlySet<string>,
  action: () => Promise<ArticleSyncResult>,
  release: () => void = () => {},
): Promise<ArticleSyncResult> {
  return withOwnedPostCommitCompletions(
    ownedSlugs,
    action,
    async (result, events) => {
      const expected = result.results.filter(
        item => item.action === 'created' || item.action === 'updated',
      )
      for (const item of expected) {
        if (!ownedSlugs.has(item.slug)) throw new Error('Article result escaped owned slugs')
        const post = await getPostByAny(item.slug)
        if (!post) throw new Error('Article result has no persisted owned post')
        const matches = events.filter(
          event =>
            event.postId === post.id && event.slug === item.slug && event.kind === item.action,
        )
        if (matches.length !== 1)
          throw new Error(`Missing or duplicate post-commit receipt for ${item.slug}`)
      }
      if (events.length !== expected.length) throw new Error('Unexpected owned post-commit receipt')
    },
    release,
  )
}

export async function seedArticleSyncTimestamp(postId: string, timestamp: Date): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`/* seedArticleSyncTimestamp */
    UPDATE posts SET updated_at = ${timestamp} WHERE id = ${postId} RETURNING id
  `)
  if (rows.length !== 1 || rows[0]?.id !== postId)
    throw new Error('Owned timestamp seed missed its post')
}
