import sharp from 'sharp'

const HASH_COLUMNS = 8
const HASH_ROWS = 8
/** A hash with fewer set bits (flat) or more (a uniform gradient) says nothing about the picture. */
const MIN_SET_BITS = 8
const MAX_SET_BITS = 64 - MIN_SET_BITS

/**
 * 64-bit difference hash (dHash) as a 64-character string of 0 and 1. The image is auto-oriented,
 * flattened onto white, greyscaled and shrunk to 9x8; each bit records whether a pixel is brighter
 * than its right neighbour. Re-encoding, resizing and mild colour changes flip few bits, so two
 * hashes within the staydown Hamming distance are near-duplicates. Returns null for an image too
 * uniform to identify, which is neither registered nor matched.
 */
export async function computeStaydownDhash(input: string | Buffer): Promise<string | null> {
  const pixels = await sharp(input)
    .rotate()
    .flatten({ background: '#ffffff' })
    .greyscale()
    .resize(HASH_COLUMNS + 1, HASH_ROWS, { fit: 'fill' })
    .raw()
    .toBuffer()
  let bits = ''
  let setBits = 0
  for (let row = 0; row < HASH_ROWS; row += 1) {
    for (let column = 0; column < HASH_COLUMNS; column += 1) {
      const index = row * (HASH_COLUMNS + 1) + column
      const brighter = pixels[index]! > pixels[index + 1]!
      bits += brighter ? '1' : '0'
      if (brighter) setBits += 1
    }
  }
  return setBits < MIN_SET_BITS || setBits > MAX_SET_BITS ? null : bits
}
