import { sanitizeRssHtml, sanitizeRssHtmlBatch } from '@jongleberry/vurst-html'
import onError from '@modules/on-error'
import { absolutizeSideloadImageSources } from '@modules/utils/absolute-sideload-html'
import type { RssFeedItemToUpsert } from './types.mts'
import { getSigningKeys } from './signing-keys.mts'

type ItemWithData = {
  id: string
  data: RssFeedItemToUpsert
}

// Matches SANITIZE_MAX_INPUT_BYTES in the vurst crate (https://github.com/jonathanong/vurst)
const BATCH_MAX_BYTES = 10 * 1024 * 1024

/**
 * Returns the best raw HTML content field from RSS feed item data, in priority order:
 * content:encoded → content → description → summary
 * Whitespace-only fields are skipped so the next field in priority order is tried.
 */
function getRawHtmlContent(data: RssFeedItemToUpsert): string | null {
  const fields = [data['content:encoded'], data.content, data.description, data.summary]
  for (const field of fields) {
    if (field && field.trim()) return field
  }
  return null
}

/**
 * Sanitize a single RSS feed item's best HTML content field using the Rust HTML sanitizer.
 *
 * Returns sanitized HTML safe for rendering, or null when no content fields exist or the
 * sanitized output is empty. The Rust sanitizer strips scripts, iframes, event handlers,
 * and dangerous URL schemes; it adds nofollow/noopener to links and lazy-loading to images.
 */
export async function sanitizeRssFeedItemContentHtml(
  data: RssFeedItemToUpsert,
): Promise<string | null> {
  const html = getRawHtmlContent(data)
  if (!html) return null

  try {
    const sanitized = await sanitizeRssHtml(Buffer.from(html, 'utf-8'), {
      proxyImages: true,
      imageProxyUrlPrefix: '/sideload/',
      imageProxySigningKeys: getSigningKeys(),
    })
    const result = absolutizeSideloadImageSources(sanitized.html.toString('utf-8').trim())
    return result || null
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    return null
  }
}

/**
 * Sanitize a batch of RSS feed items' best HTML content fields using the Rust HTML sanitizer.
 *
 * Inputs are chunked to stay at or below BATCH_MAX_BYTES; each chunk is processed by one
 * Rust N-API async task, keeping the Node.js event loop responsive. Large feeds may result in
 * multiple Rust batch calls (one per chunk).
 *
 * Returns a Record mapping item ID to sanitized HTML. Items with no content fields,
 * items exceeding the size limit, or items with empty sanitized output are omitted.
 */
export async function sanitizeRssFeedItemContentHtmlBatch(
  items: ItemWithData[],
): Promise<Record<string, string>> {
  if (items.length === 0) return {}

  const withContent: Array<{ id: string; html: string; bytes: number }> = []
  for (const item of items) {
    const html = getRawHtmlContent(item.data)
    if (html) withContent.push({ id: item.id, html, bytes: Buffer.byteLength(html, 'utf-8') })
  }

  if (withContent.length === 0) return {}

  // Chunk items so each batch stays at or below BATCH_MAX_BYTES.
  // Items individually exceeding the limit are skipped — they would fail regardless.
  const chunks: Array<Array<{ id: string; html: string }>> = []
  let current: Array<{ id: string; html: string }> = []
  let currentBytes = 0
  for (const { id, html, bytes } of withContent) {
    if (bytes > BATCH_MAX_BYTES) {
      onError(
        new Error(
          `Skipping RSS feed item ${id} content sanitization: input size ${bytes} bytes exceeds limit ${BATCH_MAX_BYTES} bytes`,
        ),
      )
      continue
    }
    if (currentBytes + bytes > BATCH_MAX_BYTES) {
      if (current.length > 0) chunks.push(current)
      current = []
      currentBytes = 0
    }
    current.push({ id, html })
    currentBytes += bytes
  }
  if (current.length > 0) chunks.push(current)

  const result: Record<string, string> = {}
  await Promise.all(
    chunks.map(async chunk => {
      try {
        const buffers = chunk.map(({ html }) => Buffer.from(html, 'utf-8'))
        const sanitized = await sanitizeRssHtmlBatch(buffers, {
          proxyImages: true,
          imageProxyUrlPrefix: '/sideload/',
          imageProxySigningKeys: getSigningKeys(),
        })
        for (let i = 0; i < chunk.length; i++) {
          const serialized = sanitized[i]?.html.toString('utf-8').trim()
          const html = serialized ? absolutizeSideloadImageSources(serialized) : undefined
          if (html) result[chunk[i]!.id] = html
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    }),
  )
  return result
}
