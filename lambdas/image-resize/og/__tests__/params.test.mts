import { describe, it, expect } from 'vitest'
import { validateOgParams, MAX_TOP_CATEGORIES } from '../params.mts'
import { RequestParseError } from '../../errors.mts'

describe('validateOgParams', () => {
  describe('generic cards', () => {
    it('accepts a valid generic payload', () => {
      const result = validateOgParams({
        type: 'generic',
        eyebrow: 'Voucha',
        title: 'A great title',
        description: 'A helpful description',
        domainLabel: 'voucha.ai',
      })
      expect(result).toEqual({
        type: 'generic',
        eyebrow: 'Voucha',
        title: 'A great title',
        description: 'A helpful description',
        domainLabel: 'voucha.ai',
      })
    })

    it('tolerates and drops the web-only rendererVersion cache-buster field', () => {
      const result = validateOgParams({
        type: 'generic',
        eyebrow: 'Voucha',
        title: 'A great title',
        description: 'A helpful description',
        domainLabel: 'voucha.ai',
        rendererVersion: 'v1',
      })
      expect(result).toEqual({
        type: 'generic',
        eyebrow: 'Voucha',
        title: 'A great title',
        description: 'A helpful description',
        domainLabel: 'voucha.ai',
      })
      expect('rendererVersion' in result).toBe(false)
    })

    it('throws when a required field is missing', () => {
      expect(() =>
        validateOgParams({ type: 'generic', eyebrow: 'Voucha', title: 'x', description: 'y' }),
      ).toThrow(RequestParseError)
      expect(() =>
        validateOgParams({ type: 'generic', eyebrow: 'Voucha', title: 'x', description: 'y' }),
      ).toThrow('domainLabel')
    })

    it('throws when a required field is empty', () => {
      expect(() =>
        validateOgParams({
          type: 'generic',
          eyebrow: '',
          title: 'x',
          description: 'y',
          domainLabel: 'z',
        }),
      ).toThrow(RequestParseError)
    })
  })

  describe('landing cards', () => {
    it('accepts a valid landing payload with placement dependencies', () => {
      const dependency = {
        placementId: '11111111-1111-4111-8111-111111111111',
        revision: 3,
        imageId: '22222222-2222-4222-8222-222222222222',
      }
      const result = validateOgParams({
        type: 'landing',
        displayName: 'Ada Lovelace',
        username: 'ada',
        topCategories: ['math', 'computing'],
        dependencies: [dependency],
      })
      expect(result).toEqual({
        type: 'landing',
        displayName: 'Ada Lovelace',
        username: 'ada',
        topCategories: ['math', 'computing'],
        dependencies: [dependency],
      })
    })

    it('defaults missing dependencies to an empty list and ignores a raw image id', () => {
      const result = validateOgParams({
        type: 'landing',
        displayName: 'Ada Lovelace',
        username: 'ada',
        topCategories: [],
        avatarImageId: 'avatars/ada.png',
      })
      expect(result.type === 'landing' && result.dependencies).toEqual([])
    })

    it('accepts an empty topCategories array', () => {
      const result = validateOgParams({
        type: 'landing',
        displayName: 'Ada',
        username: 'ada',
        topCategories: [],
      })
      expect(result.type === 'landing' && result.topCategories).toEqual([])
    })

    it('accepts a single-element topCategories array', () => {
      const result = validateOgParams({
        type: 'landing',
        displayName: 'Ada',
        username: 'ada',
        topCategories: ['math'],
      })
      expect(result.type === 'landing' && result.topCategories).toEqual(['math'])
    })

    it('defensively re-caps topCategories at MAX_TOP_CATEGORIES even if the client sent more', () => {
      const tooMany = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
      const result = validateOgParams({
        type: 'landing',
        displayName: 'Ada',
        username: 'ada',
        topCategories: tooMany,
      })
      expect(result.type === 'landing' && result.topCategories).toEqual(
        tooMany.slice(0, MAX_TOP_CATEGORIES),
      )
      expect(result.type === 'landing' && result.topCategories.length).toBe(5)
    })

    it('throws when topCategories is not an array', () => {
      expect(() =>
        validateOgParams({
          type: 'landing',
          displayName: 'Ada',
          username: 'ada',
          topCategories: 'math',
        }),
      ).toThrow(RequestParseError)
    })

    it('throws when topCategories contains non-string items', () => {
      expect(() =>
        validateOgParams({
          type: 'landing',
          displayName: 'Ada',
          username: 'ada',
          topCategories: ['math', 42],
        }),
      ).toThrow(RequestParseError)
    })

    it('throws when a dependency is not a placement tuple', () => {
      expect(() =>
        validateOgParams({
          type: 'landing',
          displayName: 'Ada',
          username: 'ada',
          topCategories: [],
          dependencies: [{ placementId: 'not-a-placement' }],
        }),
      ).toThrow(RequestParseError)
    })

    it('tolerates and drops the web-only rendererVersion cache-buster field (landing)', () => {
      const result = validateOgParams({
        type: 'landing',
        displayName: 'Ada Lovelace',
        username: 'ada',
        topCategories: ['math'],
        rendererVersion: 'v1',
      })
      expect(result).toEqual({
        type: 'landing',
        displayName: 'Ada Lovelace',
        username: 'ada',
        topCategories: ['math'],
        dependencies: [],
      })
      expect('rendererVersion' in result).toBe(false)
    })
  })

  describe('malformed payloads', () => {
    it('throws for a non-object payload', () => {
      expect(() => validateOgParams('not an object')).toThrow(RequestParseError)
      expect(() => validateOgParams(null)).toThrow(RequestParseError)
      expect(() => validateOgParams(42)).toThrow(RequestParseError)
    })

    it('throws for an unknown discriminant', () => {
      expect(() => validateOgParams({ type: 'unknown' })).toThrow(RequestParseError)
      expect(() => validateOgParams({ type: 'unknown' })).toThrow('unknown type')
    })

    it('throws when type is missing entirely', () => {
      expect(() => validateOgParams({ eyebrow: 'x' })).toThrow(RequestParseError)
    })
  })
})
