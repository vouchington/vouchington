import { buildSideloadImageUrl } from '@ts-shared/url-signing'
import { getImageOrigin } from '@modules/utils/image-origin'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import { getSigningKeys } from './signing-keys.mts'
import { recordValue, stringValue } from './chapters-values.mts'

const CHAPTERS_MAX_COUNT = 200
const CHAPTERS_MAX_SECONDS = 1_000_000

export type PodcastChapter = {
  start_seconds: number
  end_seconds: number | null
  title: string
  url: string | null
  image_url: string | null
  is_visible: boolean
}

export function normalizePodcastChapters(payload: unknown): PodcastChapter[] {
  const chapters = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' &&
        payload !== null &&
        Array.isArray((payload as { chapters?: unknown }).chapters)
      ? (payload as { chapters: unknown[] }).chapters
      : []

  const normalized = chapters.flatMap((chapter, chapterIndex) => {
    const raw = recordValue(chapter)
    if (!raw) return []
    const startSeconds = startSecondsValue(raw.startTime ?? raw.start_time ?? raw.start)
    if (startSeconds === null) return []
    const title = stringValue(raw.title) ?? `Chapter ${chapterIndex + 1}`
    return [
      {
        start_seconds: startSeconds,
        end_seconds: secondsValue(raw.endTime ?? raw.end_time ?? raw.end),
        title,
        url: normalizedHttpUrl(raw.url ?? raw.href),
        image_url: proxiedChapterImage(raw.img ?? raw.image ?? raw.imageUrl ?? raw.image_url),
        is_visible: isVisibleChapter(raw.toc),
      },
    ]
  })

  const sorted = normalized.sort((left, right) => left.start_seconds - right.start_seconds)
  return sorted.slice(0, CHAPTERS_MAX_COUNT).map((chapter, index) => ({
    ...chapter,
    end_seconds: chapter.end_seconds ?? sorted[index + 1]?.start_seconds ?? null,
  }))
}

function startSecondsValue(value: unknown): number | null {
  const seconds = secondsValue(value)
  return seconds
}

function secondsValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return isValidChapterSeconds(value) ? value : null
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed)
    return isValidChapterSeconds(seconds) ? seconds : null
  }

  const parts = trimmed.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  let total = 0
  for (const [index, part] of parts.entries()) {
    const valueNumber = Number(part)
    if (!Number.isFinite(valueNumber) || valueNumber < 0) return null
    const scale = parts.length - index === 1 ? 1 : parts.length - index === 2 ? 60 : 3600
    total += valueNumber * scale
  }
  return isValidChapterSeconds(total) ? total : null
}

function isValidChapterSeconds(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < CHAPTERS_MAX_SECONDS
}

function normalizedHttpUrl(value: unknown): string | null {
  const raw = stringValue(value)
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const normalized = normalizeUrlForUrlTable(raw, { preserveHttp: true })
    normalized.hash = parsed.hash
    return normalized.toString()
  } catch {
    return null
  }
}

function proxiedChapterImage(value: unknown): string | null {
  const raw = normalizedHttpUrl(value)
  if (!raw) return null
  return buildSideloadImageUrl(raw, {
    imageOrigin: getImageOrigin(),
    width: 400,
    signingKeys: getSigningKeys(),
  })
}

function isVisibleChapter(value: unknown): boolean {
  if (value === false) return false
  if (typeof value === 'string') return value.trim().toLowerCase() !== 'false'
  return true
}
