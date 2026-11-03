import { createHash, randomUUID } from 'node:crypto'
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { S3Buckets } from '../modules/aws/s3.mts'
import sql from 'sql-template-strings'
import { onTestFinished, vi } from 'vitest'
import { write } from '@data-stores/psql'
import type { ArticleSyncResult } from '@voucha/types/article-sync'
import { getPostByAny } from '../services/posts/get.mts'

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
  try {
    const result = await action()
    for (const item of result.results) {
      if (item.action !== 'created' && item.action !== 'updated') continue
      if (!ownedSlugs.has(item.slug)) throw new Error('Article result escaped owned slugs')
      if (!(await getPostByAny(item.slug)))
        throw new Error('Article result has no persisted owned post')
    }
    return result
  } finally {
    release()
  }
}

export async function seedArticleSyncTimestamp(postId: string, timestamp: Date): Promise<void> {
  const { rows } = await write<{ id: string }>(sql`/* seedArticleSyncTimestamp */
    UPDATE posts SET updated_at = ${timestamp} WHERE id = ${postId} RETURNING id
  `)
  if (rows.length !== 1 || rows[0]?.id !== postId)
    throw new Error('Owned timestamp seed missed its post')
}

/** One object under `articles/`: its markdown, a read failure, or a fetch the test settles itself. */
export type ArticleBucketObject = string | Error | (() => Promise<string>)

/**
 * The article bucket behind the shared S3 client. `ListObjectsV2` answers the files in `objects`
 * (read at each call, so a test can change them between syncs) and `GetObject` answers each one's
 * markdown or failure. A string's ETag is its content hash; an error or pending object gets an ETag
 * unique to this stub, so the production markdown cache cannot answer for a changed object.
 * `fetchedKeys` records the `GetObject` keys in request order.
 */
export function stubArticleBucket(objects: ReadonlyMap<string, ArticleBucketObject>): {
  fetchedKeys: string[]
} {
  const stubId = randomUUID()
  const fetchedKeys: string[] = []
  const etag = (file: string, object: ArticleBucketObject) =>
    typeof object === 'string'
      ? createHash('sha256').update(object).digest('hex')
      : `${stubId}:${file}`
  const spy = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async command => {
    if (command instanceof ListObjectsV2Command) {
      if (command.input.Bucket !== S3Buckets.assets || command.input.Prefix !== 'articles/')
        throw new Error('Article listing left the articles prefix')
      return {
        Contents: [...objects].map(([file, object]) => ({
          Key: `articles/${file}`,
          ETag: etag(file, object),
          Size: typeof object === 'string' ? Buffer.byteLength(object) : undefined,
        })),
      } as never
    }
    if (command instanceof GetObjectCommand) {
      const key = command.input.Key!
      const object = objects.get(key.slice('articles/'.length))
      if (object === undefined) throw new Error(`Missing article object ${key}`)
      fetchedKeys.push(key)
      if (object instanceof Error) throw object
      const markdown = typeof object === 'string' ? object : await object()
      return {
        Body: { transformToString: async () => markdown },
        ContentLength: Buffer.byteLength(markdown),
      } as never
    }
    throw new Error(`Unexpected S3 command: ${command.constructor.name}`)
  })
  onTestFinished(() => spy.mockRestore())
  return { fetchedKeys }
}
