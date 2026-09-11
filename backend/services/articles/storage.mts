import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { S3Buckets, S3ImagesClient } from '@modules/aws'

const ARTICLE_KEY_PREFIX = 'articles/'
const README_FILE = 'README.md'
const MAX_ARTICLE_BYTES = 256 * 1024
const MAX_CACHE_ENTRIES = 128

export type ArticleMarkdownFile = {
  file: string
  key: string
  cacheToken: string
}

type CachedArticle = {
  cacheToken: string
  markdown: string
}

const markdownCache = new Map<string, CachedArticle>()

export async function listArticleMarkdownFiles(): Promise<ArticleMarkdownFile[]> {
  const files: ArticleMarkdownFile[] = []

  let continuationToken: string | undefined
  do {
    // oxlint-disable-next-line no-await-in-loop -- each S3 response supplies the continuation token required for the next bounded page request.
    const page = await S3ImagesClient.send(
      new ListObjectsV2Command({
        Bucket: S3Buckets.assets,
        Prefix: ARTICLE_KEY_PREFIX,
        ContinuationToken: continuationToken,
      }),
    )
    for (const object of page.Contents ?? []) {
      const file = parseArticleFilename(object.Key)
      if (!file) continue

      files.push({
        file,
        key: object.Key!,
        cacheToken: getObjectCacheToken(object),
      })
    }
    continuationToken = page.NextContinuationToken
  } while (continuationToken)

  return files.sort((left, right) => left.file.localeCompare(right.file))
}

export async function getArticleMarkdown(article: ArticleMarkdownFile): Promise<string> {
  const cached = markdownCache.get(article.key)
  if (cached?.cacheToken === article.cacheToken) {
    refreshCacheEntry(article.key, cached)
    return cached.markdown
  }

  const response = await S3ImagesClient.send(
    new GetObjectCommand({
      Bucket: S3Buckets.assets,
      Key: article.key,
    }),
  )
  if (!response.Body) throw new Error(`Article object ${article.key} has no body`)

  rejectOversizedArticle(response.ContentLength)
  const markdown = await readS3BodyAsString(response.Body)
  rejectOversizedArticle(Buffer.byteLength(markdown, 'utf-8'))
  setCacheEntry(article.key, { cacheToken: article.cacheToken, markdown })
  return markdown
}

export function clearArticleMarkdownCacheForTests(): void {
  markdownCache.clear()
}

function parseArticleFilename(key: string | undefined): string | null {
  if (!key?.startsWith(ARTICLE_KEY_PREFIX)) return null

  const file = key.slice(ARTICLE_KEY_PREFIX.length)
  if (!file || file.includes('/') || !file.endsWith('.md') || file === README_FILE) return null
  return file
}

function getObjectCacheToken(object: {
  ETag?: string
  LastModified?: Date
  Size?: number
}): string {
  return [object.ETag ?? '', object.LastModified?.toISOString() ?? '', object.Size ?? ''].join(':')
}

function refreshCacheEntry(key: string, entry: CachedArticle): void {
  markdownCache.delete(key)
  markdownCache.set(key, entry)
}

function setCacheEntry(key: string, entry: CachedArticle): void {
  markdownCache.set(key, entry)

  if (markdownCache.size <= MAX_CACHE_ENTRIES) return
  const oldestKey = markdownCache.keys().next().value as string | undefined
  if (oldestKey) markdownCache.delete(oldestKey)
}

type S3BodyWithStringTransform = {
  transformToString: (encoding?: BufferEncoding) => Promise<string>
}

function readS3BodyAsString(body: unknown): Promise<string> {
  if (isS3BodyWithStringTransform(body)) return body.transformToString('utf-8')
  throw new Error('S3 article body is not readable')
}

function isS3BodyWithStringTransform(body: unknown): body is S3BodyWithStringTransform {
  return typeof (body as S3BodyWithStringTransform | null)?.transformToString === 'function'
}

function rejectOversizedArticle(bytes: number | undefined): void {
  if (bytes !== undefined && bytes > MAX_ARTICLE_BYTES) {
    throw new Error(`Article object from S3 exceeds ${MAX_ARTICLE_BYTES} bytes`)
  }
}
