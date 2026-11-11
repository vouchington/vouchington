import { randomUUID } from 'node:crypto'
import { DeleteObjectsCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { S3Buckets } from '../modules/aws/s3.mts'
import sql from 'sql-template-strings'
import { onTestFinished, vi } from 'vitest'
import { write } from '@data-stores/psql'
import type { ArticleSyncResult } from '@voucha/types/article-sync'
import { getPostByAny } from '../services/posts/get.mts'
import { emulatorS3, listS3Keys, putS3Object } from './aws-emulator-s3.mts'
import { useOwnedS3Bucket } from './s3-owned-bucket.mts'

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

const ARTICLE_PREFIX = 'articles/'

export type ArticleBucket = {
  /** Replaces every article object with these files and their markdown. */
  replace: (articles: Iterable<readonly [string, string]>) => Promise<void>
  put: (file: string, markdown: string) => Promise<void>
}

/**
 * Gives the current test its own article bucket in the AWS Emulator behind `S3Buckets.assets`, so
 * the fixed `articles/` listing sees only this test's files.
 */
export async function useArticleBucket(
  articles: Iterable<readonly [string, string]> = [],
): Promise<ArticleBucket> {
  const bucket = await useOwnedS3Bucket('assets')
  const put = async (file: string, markdown: string) => {
    await putS3Object({ Bucket: bucket, Key: `${ARTICLE_PREFIX}${file}`, Body: markdown })
  }
  const replace = async (next: Iterable<readonly [string, string]>) => {
    const existing = await listS3Keys(bucket, ARTICLE_PREFIX)
    if (existing.length) {
      await emulatorS3().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: existing.map(Key => ({ Key })) },
        }),
      )
    }
    await Promise.all([...next].map(([file, markdown]) => put(file, markdown)))
  }
  await replace(articles)
  return { replace, put }
}

/** Larger than the article size bound, so its read fails in production code. */
export function oversizedArticleMarkdown(): string {
  return 'x'.repeat(256 * 1024 + 1)
}

/**
 * S3 cannot pause a read, so ordering checks hold one article's `GetObject` at the SDK edge until
 * `load` settles; every other request reaches the emulator. `fetchedKeys` records article reads in
 * request order.
 */
export function holdArticleRead(
  file: string,
  load: () => Promise<string>,
): { fetchedKeys: string[] } {
  const fetchedKeys: string[] = []
  const send = S3Client.prototype.send
  const spy = vi.spyOn(S3Client.prototype, 'send').mockImplementation(function (
    this: S3Client,
    command,
    ...args
  ) {
    if (
      command instanceof GetObjectCommand &&
      command.input.Bucket === S3Buckets.assets &&
      command.input.Key?.startsWith(ARTICLE_PREFIX)
    ) {
      fetchedKeys.push(command.input.Key)
      if (command.input.Key === `${ARTICLE_PREFIX}${file}`) {
        return load().then(markdown => ({
          $metadata: {},
          Body: { transformToString: async () => markdown },
          ContentLength: Buffer.byteLength(markdown),
        })) as never
      }
    }
    return Reflect.apply(send, this, [command, ...args]) as never
  })
  onTestFinished(() => spy.mockRestore())
  return { fetchedKeys }
}
