import { describe, expect, it } from 'vitest'
import { createPageMetadata, createRootMetadata } from '../metadata'

describe('createPageMetadata', () => {
  it('omits openGraph.images and twitter.images when imagePath is null', () => {
    const result = createPageMetadata({ title: 'Test', imagePath: null })
    expect((result.openGraph as any)?.images).toBeUndefined()
    expect((result.twitter as any)?.images).toBeUndefined()
  })
})

describe('createRootMetadata', () => {
  it('keeps openGraph.url clean for canonical sharing metadata', () => {
    const result = createRootMetadata()
    const ogUrl = (result.openGraph as any)?.url as string
    expect(ogUrl).toBe('https://voucha.ai/')
    expect(ogUrl).not.toContain('utm_')
  })

  it('keeps canonical URL clean', () => {
    const result = createRootMetadata()
    const canonical = (result.alternates as any)?.canonical as string
    expect(canonical).not.toContain('utm_')
  })
})
