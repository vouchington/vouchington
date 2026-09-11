import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createCrawlChunks } from '@services/crawl-chunks'
import { addUrl } from '@services/urls'
import onError from '@modules/on-error'
import { resetHostnameDnsFailures } from '@services/urls-hostnames/dns-failures'
import { updateCrawl } from '../update.mts'
import { uploadCrawlHtmlFileToS3 } from '../s3.mts'
import {
  findFirstStructuredString,
  isSnapshotReusable,
  parseXRobotsTag,
  safeResolveUrl,
} from '../crawl-url-utils.mts'
import type { CrawlerHtmlStructuredObject, CrawlerHtmlStructuredValue } from '../types.mts'
import { enqueuePendingCrawlEmbed, getEmbedMetadataUpdate } from './embed-plan.mts'
import { trySetCanonicalUrl } from './redirects.mts'
import type {
  CrawlHtmlFetchResult,
  CrawlHostnameRecord,
  CrawlUrlOptions,
  CrawlUrlRecord,
} from './types.mts'

export async function persistCrawlContent(params: {
  crawlId: string
  hostname: CrawlHostnameRecord
  htmlResult: CrawlHtmlFetchResult
  options?: CrawlUrlOptions
  previousHtmlSha256: Buffer | null
  previousHtmlSnapshotUploadedAt: Date | null
  url: CrawlUrlRecord
}) {
  const {
    crawlId,
    hostname,
    htmlResult,
    options,
    previousHtmlSha256,
    previousHtmlSnapshotUploadedAt,
    url,
  } = params
  const isNoIndex = getNoIndexDirective(htmlResult)
  const htmlFile = htmlResult.htmlFile
  const now = new Date()
  const previousSnapshotReusable = isSnapshotReusable(
    previousHtmlSha256,
    previousHtmlSnapshotUploadedAt,
    now,
  )
  // A 304 has no body, so carry forward the previous hash and upload timestamp when
  // the previous S3 object is still inside the lifecycle window.
  const htmlSha256 = htmlFile
    ? await getFileSha256(htmlFile.filePath)
    : htmlResult.response_status_code === 304
      ? previousSnapshotReusable
        ? previousHtmlSha256
        : null
      : null
  const htmlSnapshotUploadedAt = await getHtmlSnapshotUploadedAt({
    hostname,
    htmlFile,
    htmlResult,
    htmlSha256,
    previousHtmlSha256,
    previousHtmlSnapshotUploadedAt,
    previousSnapshotReusable,
    url,
  })

  const updated = await updateCrawl(crawlId, url.id, {
    request_headers: htmlResult.request_headers,
    response_headers: htmlResult.response_headers,
    response_status_code: htmlResult.response_status_code,
    completed_at: htmlResult.crawl_completed_at,
    markdown: isNoIndex ? '' : htmlResult.content?.content || '',
    title: htmlResult.content?.title || null,
    links: (htmlResult.content?.links || {}) as CrawlerHtmlStructuredObject,
    meta_tags: (htmlResult.content?.meta || {}) as CrawlerHtmlStructuredObject,
    ...getEmbedMetadataUpdate(htmlResult, options),
    lang: htmlResult.content?.lang || null,
    html_sha256: htmlSha256,
    html_snapshot_uploaded_at: htmlSnapshotUploadedAt,
  })

  // The persisted pending marker is durable and backfilled by the crawl-embeds worker.
  // A transient queue failure must not skip core post-processing for a completed crawl.
  await enqueuePendingCrawlEmbed(updated).catch(onError)

  if (
    !options?.skipChunks &&
    !isNoIndex &&
    updated.response_status_code === 200 &&
    updated.markdown.length > 0
  ) {
    await createCrawlChunks(updated)
  }

  if (!isNoIndex && options?.skipCanonicalUrl !== true) {
    await setHtmlCanonicalUrl(url.id, url.url, htmlResult.content?.canonicalUrl)
  }

  resetHostnameDnsFailures(hostname.id).catch(onError)
  return updated
}

function isUnchangedFreshSnapshot(
  htmlSha256: Buffer,
  previousHtmlSha256: Buffer | null,
  previousSnapshotReusable: boolean,
) {
  return previousSnapshotReusable && previousHtmlSha256?.equals(htmlSha256) === true
}

async function getHtmlSnapshotUploadedAt(params: {
  hostname: CrawlHostnameRecord
  htmlFile: CrawlHtmlFetchResult['htmlFile']
  htmlResult: CrawlHtmlFetchResult
  htmlSha256: Buffer | null
  previousHtmlSha256: Buffer | null
  previousHtmlSnapshotUploadedAt: Date | null
  previousSnapshotReusable: boolean
  url: CrawlUrlRecord
}) {
  const {
    hostname,
    htmlFile,
    htmlResult,
    htmlSha256,
    previousHtmlSha256,
    previousHtmlSnapshotUploadedAt,
    previousSnapshotReusable,
    url,
  } = params

  if (!htmlFile || !htmlSha256) {
    return htmlResult.response_status_code === 304 && previousSnapshotReusable
      ? previousHtmlSnapshotUploadedAt
      : null
  }

  if (isUnchangedFreshSnapshot(htmlSha256, previousHtmlSha256, previousSnapshotReusable)) {
    return previousHtmlSnapshotUploadedAt
  }

  await uploadCrawlHtmlFileToS3(
    hostname.hostname,
    url.id,
    htmlSha256.toString('hex'),
    htmlFile.filePath,
  )
  return new Date()
}

async function getFileSha256(filePath: string): Promise<Buffer> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest()
}

function getNoIndexDirective(htmlResult: CrawlHtmlFetchResult) {
  const robotsMeta =
    findFirstStructuredString(
      htmlResult.content?.meta?.['robots'] as CrawlerHtmlStructuredValue | undefined,
    ) || ''
  const xRobotsTag = parseXRobotsTag(htmlResult.response_headers['x-robots-tag'] || '')
  return /\bnoindex\b/i.test(`${robotsMeta} ${xRobotsTag}`)
}

async function setHtmlCanonicalUrl(
  urlId: string,
  url: string,
  canonicalRaw: string | null | undefined,
) {
  const canonicalResolved = safeResolveUrl(canonicalRaw, url)
  if (!canonicalResolved || canonicalResolved === url) return

  const canonicalUrlEntry = await addUrl(null, canonicalResolved)
  if (canonicalUrlEntry && canonicalUrlEntry.id !== urlId) {
    await trySetCanonicalUrl(urlId, canonicalUrlEntry.id)
  }
}
