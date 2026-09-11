import { describe, expect, it } from 'vitest'
import manifest from './manifest'

describe('manifest', () => {
  it('declares png, apple, and maskable icons', () => {
    const data = manifest()

    expect(data.theme_color).toBe('#b8860b')
    expect(data.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', type: 'image/png' }),
        expect.objectContaining({ src: '/icons/icon-512.png', type: 'image/png' }),
        expect.objectContaining({
          src: '/icons/maskable-icon-512.png',
          purpose: 'maskable',
          type: 'image/png',
        }),
        expect.objectContaining({ src: '/icons/apple-touch-icon.png', type: 'image/png' }),
      ]),
    )
  })
})
