import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  createStaydownNearDuplicate,
  createStaydownPatternImage,
} from '@voucha/test-helpers/staydown-pattern-image'
import { computeStaydownDhash } from './staydown-dhash.mts'

function hammingDistance(a: string, b: string): number {
  return a.split('').filter((bit, index) => bit !== b[index]).length
}

describe('computeStaydownDhash', () => {
  it('returns a 64-bit hash', async () => {
    await expect(computeStaydownDhash(await createStaydownPatternImage(1))).resolves.toMatch(
      /^[01]{64}$/,
    )
  })

  it('keeps a re-encoded, resized copy within the matching distance', async () => {
    const original = await createStaydownPatternImage(1)
    const copy = await createStaydownNearDuplicate(original)
    const [originalHash, copyHash] = await Promise.all([
      computeStaydownDhash(original),
      computeStaydownDhash(copy),
    ])
    expect(hammingDistance(originalHash!, copyHash!)).toBeLessThanOrEqual(8)
  })

  it('puts an unrelated image far beyond the matching distance', async () => {
    const [first, second] = await Promise.all([
      computeStaydownDhash(await createStaydownPatternImage(1)),
      computeStaydownDhash(await createStaydownPatternImage(2)),
    ])
    expect(hammingDistance(first!, second!)).toBeGreaterThan(16)
  })

  it('refuses to hash a flat image, which identifies nothing', async () => {
    const flat = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#808080' },
    })
      .png()
      .toBuffer()
    await expect(computeStaydownDhash(flat)).resolves.toBeNull()
  })
})
