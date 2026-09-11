import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { S3Buckets, S3ImagesClient } from '@modules/aws'
import type { TrackedDayRange } from './types.mts'
import { applyStoragePrefix, stripStoragePrefix } from './storage-prefix.mts'

const POST_SITEMAP_KEY_PREFIX = 'posts/'

export async function findTrackedDayRangeFromS3(): Promise<TrackedDayRange | null> {
  let earliestDay: string | null = null
  let latestDay: string | null = null

  let continuationToken: string | undefined
  do {
    // oxlint-disable-next-line no-await-in-loop -- each S3 response supplies the continuation token required for the next bounded page request.
    const page = await S3ImagesClient.send(
      new ListObjectsV2Command({
        Bucket: S3Buckets.sitemaps,
        Prefix: applyStoragePrefix(POST_SITEMAP_KEY_PREFIX),
        ContinuationToken: continuationToken,
      }),
    )
    for (const object of page.Contents ?? []) {
      const parsed = parseTrackedDayFromStorageKey(object.Key)
      if (!parsed) continue

      if (!earliestDay || parsed < earliestDay) {
        earliestDay = parsed
      }
      if (!latestDay || parsed > latestDay) {
        latestDay = parsed
      }
    }
    continuationToken = page.NextContinuationToken
  } while (continuationToken)

  if (!earliestDay || !latestDay) {
    return null
  }

  return {
    earliestDay,
    latestDay,
  }
}

function parseTrackedDayFromStorageKey(key: string | undefined): string | null {
  if (!key) return null

  const normalized = stripStoragePrefix(key)
  const match = normalized.match(/^posts\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+\/[^/]+$/)
  if (!match) return null

  return `${match[1]}-${match[2]}-${match[3]}`
}
