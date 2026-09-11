import type { OutputFormat } from '../config.mts'

export interface TransformOptions {
  width: number
  height?: number
  quality: number
  lossless: boolean
  progressive: boolean
  format: OutputFormat
}
