/**
 * Pure extractors for podcast-specific feed-level itunes namespace metadata.
 * Extracted here so validate.mts stays under the max-lines limit.
 * Uses the same opaque-record + type-guard drilling pattern as media-classify.mts.
 */

const MAX_DESCRIPTION_LENGTH = 4000

/**
 * Strips HTML tags, decodes common HTML entities, collapses whitespace, and trims.
 * Returns null for blank results.
 */
function normalizePodcastDescription(raw: string): string | null {
  // Decode HTML entities first so entity-escaped tags like &lt;p&gt; are also stripped
  const decoded = raw
    .replace(/&#(\d+);/g, (match, d) => {
      const cp = parseInt(d, 10)
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (match, h) => {
      const cp = parseInt(h, 16)
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
  const stripped = decoded
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION_LENGTH)
    .trim()
  return stripped || null
}

export type PodcastShowExtracted = {
  itunes_author: string | null
  itunes_owner_name: string | null
  itunes_owner_email: string | null
  cover_art_url: string | null
  is_explicit: boolean
  itunes_type: 'episodic' | 'serial' | null
  description: string | null
}

/**
 * Extracts podcast show metadata from the feed-level itunes namespace.
 * Returns null if no itunes data is present (i.e. the feed is not a podcast).
 */
export function extractPodcastShowMetadata(
  parsedFeed: Record<string, unknown>,
): PodcastShowExtracted | null {
  const itunes = parsedFeed['itunes'] as Record<string, unknown> | undefined
  if (!itunes) return null

  const author = typeof itunes['author'] === 'string' ? itunes['author'].slice(0, 255).trim() : null
  const ownerRaw = itunes['owner'] as Record<string, unknown> | undefined
  const ownerName =
    typeof ownerRaw?.['name'] === 'string' ? ownerRaw['name'].slice(0, 255).trim() : null
  const ownerEmail =
    typeof ownerRaw?.['email'] === 'string' ? ownerRaw['email'].slice(0, 320).trim() : null

  // feedsmith exposes itunes:image as {href: string} at feed level (unlike item level where it's a bare string)
  const imageRaw = itunes['image']
  let coverArtUrl: string | null = null
  if (typeof imageRaw === 'string') {
    coverArtUrl = imageRaw.slice(0, 2048).trim() || null
  } else if (imageRaw && typeof imageRaw === 'object' && 'href' in imageRaw) {
    const href = (imageRaw as Record<string, unknown>)['href']
    if (typeof href === 'string') coverArtUrl = href.slice(0, 2048).trim() || null
  }

  const explicitRaw = itunes['explicit']
  const explicitStr = typeof explicitRaw === 'string' ? explicitRaw.toLowerCase() : null
  const isExplicit =
    explicitRaw === true || explicitStr === 'yes' || explicitStr === 'true' || explicitStr === '1'

  const typeRaw = itunes['type']
  const itunesType: 'episodic' | 'serial' | null =
    typeRaw === 'episodic' || typeRaw === 'serial' ? typeRaw : null

  // Channel-level description: feedsmith exposes it at the top of the feed object.
  const rawDescription = parsedFeed['description']
  const description =
    typeof rawDescription === 'string' ? normalizePodcastDescription(rawDescription) : null

  return {
    itunes_author: author || null,
    itunes_owner_name: ownerName || null,
    itunes_owner_email: ownerEmail || null,
    cover_art_url: coverArtUrl,
    is_explicit: isExplicit,
    itunes_type: itunesType,
    description,
  }
}

/**
 * Extracts and flattens feed-level Apple itunes:category values.
 * Handles nested subcategories (e.g. News > Tech News) by recording both parent and leaf.
 * Returns normalized (trimmed, lowercased) category strings, deduplicated.
 */
export function extractFeedCategories(parsedFeed: Record<string, unknown>): string[] {
  const itunes = parsedFeed['itunes'] as Record<string, unknown> | undefined
  if (!itunes) return []

  const rawCategories = itunes['categories']
  if (!rawCategories) return []
  const categories = Array.isArray(rawCategories) ? rawCategories : [rawCategories]

  const result: string[] = []
  const seen = new Set<string>()

  const MAX_CATEGORIES = 20

  function collectCategory(cat: unknown, depth = 0): void {
    if (result.length >= MAX_CATEGORIES || depth > 3) return
    if (!cat || typeof cat !== 'object') return
    const catObj = cat as Record<string, unknown>
    const text = catObj['text']
    if (typeof text === 'string') {
      const normalized = text.trim().toLowerCase().slice(0, 255)
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        result.push(normalized)
      }
    }
    // Recurse into nested subcategories
    const sub = catObj['categories']
    if (Array.isArray(sub)) {
      for (const subcat of sub) collectCategory(subcat, depth + 1)
    }
  }

  for (const category of categories) collectCategory(category)
  return result
}
