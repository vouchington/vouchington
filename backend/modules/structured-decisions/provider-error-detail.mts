import type { Response } from 'undici'
import type { ProviderErrorDetail } from './types.mts'

const MAX_BODY_BYTES = 16 * 1024
const MAX_MESSAGE_CHARS = 200
const MAX_FIELD_CHARS = 64
const MAX_REASONS = 8
const REDACTED = '[redacted]'

/**
 * Reads the provider's error body, bounded, and keeps only the documented safe fields:
 * `error.code`, a truncated `error.message`, and the metadata keys `error_type`, `provider_code`,
 * `reasons`, `provider_name`, `model_slug` and `limit_source`. A moderation block's
 * `flagged_input` is user content: it is never kept, and any echo of it is cut from the message.
 * A body that is missing, unreadable, too long to parse or not the documented JSON shape yields
 * `undefined`, never an exception, so the caller classifies from the status alone.
 */
export async function readProviderErrorDetail(
  response: Response,
): Promise<ProviderErrorDetail | undefined> {
  const text = await readBoundedText(response)
  if (text === null) return undefined
  try {
    return parseProviderErrorDetail(JSON.parse(text))
  } catch {
    return undefined
  }
}

function parseProviderErrorDetail(body: unknown): ProviderErrorDetail | undefined {
  if (!isRecord(body) || !isRecord(body.error)) return undefined
  const { code, message, metadata } = body.error
  const meta = isRecord(metadata) ? metadata : {}
  const errorType = shortText(meta.error_type)
  const providerCode = shortText(meta.provider_code)
  const providerName = shortText(meta.provider_name)
  const modelSlug = shortText(meta.model_slug)
  const limitSource = shortText(meta.limit_source)
  const reasons = Array.isArray(meta.reasons)
    ? meta.reasons.flatMap(reason => shortText(reason) ?? []).slice(0, MAX_REASONS)
    : undefined
  const safeMessage = typeof message === 'string' ? boundMessage(message, meta.flagged_input) : null
  return {
    ...(typeof code === 'number' && Number.isFinite(code) ? { code } : {}),
    ...(typeof code === 'string' ? { code: code.slice(0, MAX_FIELD_CHARS) } : {}),
    ...(safeMessage ? { message: safeMessage } : {}),
    ...(errorType ? { errorType } : {}),
    ...(providerCode ? { providerCode } : {}),
    ...(reasons ? { reasons } : {}),
    ...(providerName ? { providerName } : {}),
    ...(modelSlug ? { modelSlug } : {}),
    ...(limitSource ? { limitSource } : {}),
    moderation: 'flagged_input' in meta || Array.isArray(meta.reasons),
    guardrail: 'patterns' in meta,
  }
}

/** A one-line, already-bounded description for an error message or log line. */
export function describeProviderErrorDetail(detail: ProviderErrorDetail): string {
  const head = [
    detail.code === undefined ? '' : `code ${detail.code}`,
    detail.errorType ? `type ${detail.errorType}` : '',
    detail.providerCode ? `provider code ${detail.providerCode}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  return [head, detail.message ?? ''].filter(Boolean).join(': ')
}

function boundMessage(message: string, flaggedInput: unknown): string {
  // The provider truncates a long `flagged_input` in the middle with "...", so each remaining
  // fragment is cut as well as the whole value.
  const fragments =
    typeof flaggedInput === 'string'
      ? [flaggedInput, ...flaggedInput.split('...')].filter(fragment => fragment.length >= 4)
      : []
  const redacted = fragments.reduce(
    (text, fragment) => text.split(fragment).join(REDACTED),
    message,
  )
  return redacted.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_CHARS)
}

function shortText(value: unknown): string | undefined {
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string' || text.length === 0) return undefined
  return text.slice(0, MAX_FIELD_CHARS)
}

/** Reads at most `MAX_BODY_BYTES`, then cancels the rest of the stream. Never throws. */
async function readBoundedText(response: Response): Promise<string | null> {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (size < MAX_BODY_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
      size += value.byteLength
    }
    return Buffer.concat(chunks).subarray(0, MAX_BODY_BYTES).toString('utf8')
  } catch {
    return null
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
