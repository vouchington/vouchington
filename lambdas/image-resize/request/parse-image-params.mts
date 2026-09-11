import {
  OUTPUT_FORMATS,
  DEFAULT_QUALITY,
  DEFAULT_LOSSLESS,
  DEFAULT_PROGRESSIVE,
  type OutputFormat,
} from '../config.mts'
import { RequestParseError } from '../errors.mts'

export interface ImageParams {
  width: number
  height?: number
  quality: number
  lossless: boolean
  progressive: boolean
  format?: OutputFormat
  acceptHeader?: string
}

export function parseImageParams(
  params: Record<string, string | undefined>,
  headers: Record<string, string | undefined>,
): ImageParams {
  // Parse width (required)
  const widthStr = params.w
  if (!widthStr) {
    throw new RequestParseError('Missing required parameter: w', 400)
  }
  const width = Number.parseInt(widthStr, 10)
  if (Number.isNaN(width) || width <= 0) {
    throw new RequestParseError('Invalid width: must be a positive integer', 400)
  }

  // Parse height (optional)
  let height: number | undefined
  const heightStr = params.h
  if (heightStr) {
    height = Number.parseInt(heightStr, 10)
    if (Number.isNaN(height) || height <= 0) {
      throw new RequestParseError('Invalid height: must be a positive integer', 400)
    }
  }

  // Parse quality (optional, default 75)
  let quality = DEFAULT_QUALITY
  const qualityStr = params.q
  if (qualityStr) {
    quality = Number.parseInt(qualityStr, 10)
    if (Number.isNaN(quality) || quality < 1 || quality > 100) {
      throw new RequestParseError('Invalid quality: must be between 1 and 100', 400)
    }
  }

  // Parse lossless (optional, default false)
  const lossless = params.l === '1' || params.l === 'true' ? true : DEFAULT_LOSSLESS

  // Parse progressive (optional, default false)
  const progressive = params.p === '1' || params.p === 'true' ? true : DEFAULT_PROGRESSIVE

  // Parse format (optional, will be negotiated later if not specified)
  let format: OutputFormat | undefined
  const formatStr = params.f
  if (formatStr) {
    if (!OUTPUT_FORMATS.includes(formatStr as OutputFormat)) {
      throw new RequestParseError(
        `Invalid format: must be one of ${OUTPUT_FORMATS.join(', ')}`,
        400,
      )
    }
    format = formatStr as OutputFormat
  }

  // Get Accept header for format negotiation
  const acceptHeader = headers['Accept'] || headers['accept']

  return { width, height, quality, lossless, progressive, format, acceptHeader }
}
