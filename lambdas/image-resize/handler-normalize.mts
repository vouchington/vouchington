import { buildCacheKey, sha256 } from './cache/index.mts'
import { negotiateFormat } from './transform/index.mts'
import type { EnvironmentConfig, SideloadConfig } from './config.mts'
import type { parseRouterRequest } from './request/index.mts'

export function normalizeS3Request(
  request: Extract<ReturnType<typeof parseRouterRequest>, { type: 's3' }>,
  config: EnvironmentConfig,
) {
  const format = negotiateFormat(request.acceptHeader, request.format)
  const width = selectWidth(config.widths, request.width)
  const quality = clampQuality(config.qualities, request.quality)
  const cacheKey = buildCacheKey({
    key: request.key,
    width,
    height: request.height,
    quality,
    lossless: request.lossless,
    progressive: request.progressive,
    format,
  })

  return { cacheKey, format, quality, width }
}

export function normalizeSideloadRequest(
  request: Extract<ReturnType<typeof parseRouterRequest>, { type: 'sideload' }>,
  config: SideloadConfig,
) {
  const format = negotiateFormat(request.acceptHeader, request.format)
  const width = selectWidth(config.widths, request.width)
  const quality = clampQuality(config.qualities, request.quality)
  const cacheKey = buildCacheKey({
    key: sha256(request.url),
    width,
    height: request.height,
    quality,
    lossless: request.lossless,
    progressive: request.progressive,
    format,
  })

  return { cacheKey, format, quality, width }
}

function selectWidth(configuredWidths: number[], requestedWidth: number): number {
  const validWidths = configuredWidths.filter(w => w <= requestedWidth)
  if (validWidths.length === 0) {
    return Math.min(...configuredWidths)
  }
  return Math.max(...validWidths)
}

function clampQuality(configuredQualities: number[], requestedQuality: number): number {
  const minQuality = Math.min(...configuredQualities)
  const maxQuality = Math.max(...configuredQualities)
  return Math.max(minQuality, Math.min(maxQuality, requestedQuality))
}
