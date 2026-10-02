import sharp from 'sharp'

const SIZE = 256
const GRID = 16

/**
 * A deterministic block pattern as a PNG: structure a perceptual hash can see, unlike per-pixel
 * noise. Different seeds give unrelated pictures; the same seed always gives the same one.
 */
export async function createStaydownPatternImage(seed: number): Promise<Buffer> {
  let state = seed
  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    // The top byte: the low bits of a power-of-two LCG repeat every 256 draws, which would leave
    // only 256 distinct pictures for the shared test database to collide on.
    return Math.floor(state / 16_777_216)
  }
  const cells = Array.from({ length: GRID * GRID }, () => next())
  const cell = SIZE / GRID
  const raw = Buffer.alloc(SIZE * SIZE * 3)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const value = cells[Math.floor(y / cell) * GRID + Math.floor(x / cell)]!
      const offset = (y * SIZE + x) * 3
      raw[offset] = value
      raw[offset + 1] = value
      raw[offset + 2] = value
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toBuffer()
}

/** A re-encoded, half-size JPEG of `original`: the near-duplicate staydown must still recognise. */
export function createStaydownNearDuplicate(original: Buffer): Promise<Buffer> {
  return sharp(original)
    .resize(SIZE / 2)
    .jpeg({ quality: 60 })
    .toBuffer()
}
