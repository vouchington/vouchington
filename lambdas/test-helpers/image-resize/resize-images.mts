type ImageEncoder = (
  pixels: Buffer,
  raw: { width: number; height: number; channels: 1 | 3 | 4 },
  format: 'jpeg' | 'png',
  grayscale?: boolean,
) => Promise<Buffer>

export async function createResizeTestImages(encode: ImageEncoder) {
  const rgbImage = await encode(
    Buffer.alloc(100 * 100 * 3, 255),
    {
      width: 100,
      height: 100,
      channels: 3,
    },
    'jpeg',
  )
  const grayscaleImage = await encode(
    Buffer.alloc(100 * 100, 128),
    {
      width: 100,
      height: 100,
      channels: 1,
    },
    'png',
    true,
  )
  const alphaBuffer = Buffer.alloc(100 * 100 * 4)
  for (let i = 0; i < alphaBuffer.length; i += 4) {
    alphaBuffer[i] = 255
    alphaBuffer[i + 1] = 0
    alphaBuffer[i + 2] = 0
    alphaBuffer[i + 3] = 128
  }
  const alphaImage = await encode(alphaBuffer, { width: 100, height: 100, channels: 4 }, 'png')
  const largeImage = await encode(
    Buffer.alloc(1000 * 1000 * 3, 255),
    {
      width: 1000,
      height: 1000,
      channels: 3,
    },
    'jpeg',
  )
  const smallImage = await encode(
    Buffer.alloc(50 * 50 * 3, 255),
    {
      width: 50,
      height: 50,
      channels: 3,
    },
    'jpeg',
  )
  return { rgbImage, grayscaleImage, alphaImage, largeImage, smallImage }
}
