import { negotiateImageFormat } from '@vouchington/image-resize'
import { DEFAULT_FORMAT, type OutputFormat } from '../config.mts'

const NEGOTIATED_FORMAT_ORDER = ['avif', 'webp', 'png', 'jpeg'] as const

export function negotiateFormat(
  acceptHeader?: string,
  requestedFormat?: OutputFormat,
): OutputFormat {
  return negotiateImageFormat({
    accept: acceptHeader,
    requested: requestedFormat,
    supported: NEGOTIATED_FORMAT_ORDER,
    fallback: DEFAULT_FORMAT,
  })
}
