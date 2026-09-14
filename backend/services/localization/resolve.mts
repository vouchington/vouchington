import {
  LocalizationBoundError,
  DEFAULT_LOCALIZATION_BOUNDS,
  assertPublicLocalizationConsumer,
  etagMatches,
  localizationEtag,
  serializeLocalizationBatch,
  type LocalizationBatch,
  type LocalizationRequest,
} from '@vouchington/localization'
import { resolveLocalizationBatch } from '@vouchington/localization-compiler'
import { getLocalizationDatabase } from './database.mts'
import { queryValues } from './query.mts'
export function resolvePublicLocalizationBatch(request: LocalizationRequest): LocalizationBatch {
  assertPublicLocalizationConsumer(request.consumer)
  return resolveLocalizationBatch(getLocalizationDatabase(), request, {
    bounds: DEFAULT_LOCALIZATION_BOUNDS,
  })
}

export function localizationBatchPayload(request: LocalizationRequest): {
  etag: string
  revision: string
  ttlSeconds: number
  body: string
} {
  const batch = resolvePublicLocalizationBatch(request)
  return {
    etag: localizationEtag(batch.revision),
    revision: batch.revision,
    ttlSeconds: batch.ttlSeconds,
    body: serializeLocalizationBatch(batch),
  }
}

export function isLocalizationClientError(error: unknown): error is Error {
  return (
    error instanceof TypeError ||
    error instanceof LocalizationBoundError ||
    (error instanceof Error && 'code' in error && error.code === 'LOCALIZATION_BOUNDS')
  )
}

export function localizationGetResult(
  query: Readonly<Record<string, unknown>>,
  ifNoneMatch: string | undefined,
): {
  status: 200 | 304
  etag: string
  ttlSeconds: number
  body?: string
} {
  const consumer = query.consumer
  if (typeof consumer !== 'string' || consumer.length === 0) {
    throw new TypeError('consumer is required')
  }
  const payload = localizationBatchPayload({
    consumer: assertPublicLocalizationConsumer(consumer),
    locales: queryValues(query.locales),
    selectors: queryValues(query.selectors),
  })
  if (etagMatches(ifNoneMatch, payload.revision)) {
    return { status: 304, etag: payload.etag, ttlSeconds: payload.ttlSeconds }
  }
  return { status: 200, etag: payload.etag, ttlSeconds: payload.ttlSeconds, body: payload.body }
}

export function resolveEmailLocalizationBatch(
  locales: readonly string[],
  selectors: readonly string[],
): LocalizationBatch {
  return resolveLocalizationBatch(getLocalizationDatabase(), {
    consumer: 'email',
    locales,
    selectors,
  })
}
