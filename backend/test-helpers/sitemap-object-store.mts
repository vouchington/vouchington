import { randomUUID } from 'node:crypto'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { onTestFinished, vi } from 'vitest'
import { listS3Keys, emulatorS3, putS3Object, s3ObjectExists } from './aws-emulator-s3.mts'
import { clearS3ObjectDenials, denyS3ObjectActions, useOwnedS3Bucket } from './s3-owned-bucket.mts'

type SitemapManifest = {
  active_page_count: number
  generation_id: string
  generated_at: string
  content_hash: string
}

/** Sitemap storage keys as production names them, before `SITEMAP_S3_PREFIX` is applied. */
export type SitemapObjectStore = {
  get: (key: string) => Promise<Buffer | undefined>
  json: <T>(key: string) => Promise<T | undefined>
  has: (key: string) => Promise<boolean>
  keys: (keyPrefix: string) => Promise<string[]>
  /** Seeds an object; a manifest is stored as the index's publication metadata. */
  put: (key: string, body: string | Uint8Array, manifest?: SitemapManifest) => Promise<void>
  /** Real AccessDenied for these keys (`*` wildcards allowed); replaces earlier denials. */
  deny: (keys: { put?: readonly string[]; delete?: readonly string[] }) => Promise<void>
  allowAll: () => Promise<void>
}

/**
 * Gives the current test its own sitemap bucket in the AWS Emulator and its own storage prefix,
 * so fixed sitemap paths and the tracked-range cache key cannot collide with concurrent tests.
 */
export async function useSitemapObjectStore(): Promise<SitemapObjectStore> {
  const prefix = `sitemap-fixture-${randomUUID()}/`
  vi.stubEnv('SITEMAP_S3_PREFIX', prefix)
  onTestFinished(async () => {
    await cacheValkeyClient.unlink([`${prefix}sitemaps:posts:tracked-range:v1`])
  })
  const bucket = await useOwnedS3Bucket('sitemaps')
  const physical = (key: string) => `${prefix}${key}`

  const get = async (key: string): Promise<Buffer | undefined> => {
    try {
      const result = await emulatorS3().send(
        new GetObjectCommand({ Bucket: bucket, Key: physical(key) }),
      )
      return result.Body ? Buffer.from(await result.Body.transformToByteArray()) : undefined
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return undefined
      throw err
    }
  }

  return {
    get,
    json: async <T,>(key: string) => {
      const body = await get(key)
      return body === undefined ? undefined : (JSON.parse(body.toString()) as T)
    },
    has: key => s3ObjectExists(bucket, physical(key)),
    keys: async keyPrefix =>
      (await listS3Keys(bucket, physical(keyPrefix))).map(key => key.slice(prefix.length)),
    put: async (key, body, manifest) => {
      await putS3Object({
        Bucket: bucket,
        Key: physical(key),
        Body: body,
        ...(manifest ? { Metadata: { 'sitemap-manifest': JSON.stringify(manifest) } } : {}),
      })
    },
    deny: ({ put = [], delete: deleted = [] }) =>
      denyS3ObjectActions(bucket, [
        ...(put.length ? [{ action: 's3:PutObject' as const, keys: put.map(physical) }] : []),
        ...(deleted.length
          ? [{ action: 's3:DeleteObject' as const, keys: deleted.map(physical) }]
          : []),
      ]),
    allowAll: () => clearS3ObjectDenials(bucket),
  }
}
