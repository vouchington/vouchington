import { CACHE_VERSION, type OutputFormat } from '../config.mts'

interface CacheKeyParams {
  key: string
  width: number
  height?: number
  quality: number
  lossless: boolean
  progressive: boolean
  format: OutputFormat
}

export function buildCacheKey(params: CacheKeyParams): string {
  const { key, width, height, quality, lossless, progressive, format } = params
  const heightPart = height ? `-h${height}` : ''
  const losslessPart = lossless ? '-l1' : '-l0'
  const progressivePart = progressive ? '-p1' : '-p0'

  return `${key}--w${width}${heightPart}${losslessPart}${progressivePart}-q${quality}-f${format}-v${CACHE_VERSION}`
}
