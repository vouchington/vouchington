'use client'

class ImageBlockedError extends Error {
  imageId: string
  constructor(imageId: string) {
    super('Image blocked by content moderation')
    this.name = 'ImageBlockedError'
    this.imageId = imageId
  }
}

class ImageProcessingTimeoutError extends Error {
  imageId: string
  constructor(imageId: string) {
    super('Image processing timed out')
    this.name = 'ImageProcessingTimeoutError'
    this.imageId = imageId
  }
}

export {
  ImageBlockedError as InternalImageBlockedError,
  ImageProcessingTimeoutError as InternalImageProcessingTimeoutError,
}
