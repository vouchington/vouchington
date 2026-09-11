import { MediaSizeLimitError, spoolMediaBody } from '@vouchington/media'

export interface TempImageFile {
  path: string
  cleanup: () => Promise<void>
}

export type ImageBody = Buffer | TempImageFile

export interface FetchedImage {
  // `buffer` remains an injection seam for existing small test fixtures. Runtime
  // fetchers always return `file`; production request paths never accumulate it.
  buffer?: Buffer
  file?: TempImageFile
  etag: string
  contentType: string
}

export function isTempImageFile(body: ImageBody): body is TempImageFile {
  return !Buffer.isBuffer(body)
}

export async function spoolImageToTempFile(
  chunks: AsyncIterable<Uint8Array>,
  maxBytes: number,
  createTooLargeError: (bytes: number) => Error,
): Promise<TempImageFile> {
  try {
    return await spoolMediaBody(chunks, { maxBytes, prefix: 'voucha-image-resize-' })
  } catch (error: unknown) {
    if (error instanceof MediaSizeLimitError) throw createTooLargeError(error.size)
    throw error
  }
}
