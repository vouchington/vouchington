import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('../instance'),
)

vi.mock<typeof import('react')>(import('react'), async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    cache: ((fn: (...args: never[]) => unknown) => fn) as unknown as typeof actual.cache,
  }
})

vi.mock(import('@/lib/api/return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: vi.fn<VitestLooseMock>(async (promise: Promise<unknown>) => promise),
}))

import {
  getAllMyReferralLinks,
  getMyReferralLinks,
  getOfficialReferralLinks,
  getReferralProgramValidationInfo,
  getReferralProgramValidations,
} from '../referral-links'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'

const mockReturnNullForMissingEntity = vi.mocked(returnNullForMissingEntity)

describe('referral-links server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockReturnNullForMissingEntity.mockReset()
    mockReturnNullForMissingEntity.mockImplementation(async (promise: Promise<unknown>) => promise)
  })

  describe('getMyReferralLinks', () => {
    it('calls the filtered endpoint and wraps the request', async () => {
      const links = [
        {
          id: 'link-1',
          label: null,
          referral_program_id: 'program-1',
          url: 'https://example.com/ref',
          user_id: 'user-1',
        },
      ]
      mockGet.mockResolvedValueOnce({ items: links })

      const result = await getMyReferralLinks('program-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/referral-links', {
        searchParams: { referral_program_id: 'program-1' },
      })
      expect(mockReturnNullForMissingEntity).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ items: links })
    })

    it('returns null when the entity is missing', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      mockGet.mockResolvedValueOnce({ items: [] })

      const result = await getMyReferralLinks('missing-program')

      expect(result).toBeNull()
    })
  })

  describe('getAllMyReferralLinks', () => {
    it('calls the endpoint and wraps the request', async () => {
      mockGet.mockResolvedValueOnce({ items: [] })

      const result = await getAllMyReferralLinks()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/referral-links')
      expect(mockReturnNullForMissingEntity).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ items: [] })
    })

    it('returns null when the entity is missing', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      mockGet.mockResolvedValueOnce({ items: [] })

      const result = await getAllMyReferralLinks()

      expect(result).toBeNull()
    })
  })

  describe('getOfficialReferralLinks', () => {
    it('calls the correct endpoint and returns official_referral_links', async () => {
      const links = [
        { id: 'link-1', url: 'https://example.com', label: 'Official', activated_at: '2026-01-01' },
      ]
      mockGet.mockResolvedValueOnce({ official_referral_links: links })

      const result = await getOfficialReferralLinks('program-1')

      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/referral-programs/program-1/official-referral-links',
      )
      expect(result).toEqual({ official_referral_links: links })
    })
  })

  describe('getReferralProgramValidationInfo', () => {
    it('calls the correct endpoint and returns validation_info', async () => {
      const validationInfo = {
        user_help_text: 'Find your link in Account settings',
        example_urls: ['https://bank.com/ref/you'],
      }
      mockGet.mockResolvedValueOnce({ validation_info: validationInfo })

      const result = await getReferralProgramValidationInfo('program-1')

      expect(mockGet).toHaveBeenCalledWith(
        '/api/v1/topics/program-1/referral-program/validation-info',
      )
      expect(result).toEqual(validationInfo)
    })

    it('returns null when the entity is missing (404)', async () => {
      mockReturnNullForMissingEntity.mockResolvedValueOnce(null)
      mockGet.mockResolvedValueOnce({ validation_info: { user_help_text: '', example_urls: [] } })

      const result = await getReferralProgramValidationInfo('program-missing')

      expect(result).toBeNull()
    })
  })

  describe('getReferralProgramValidations', () => {
    it('calls the scoped endpoint and returns results', async () => {
      const results = [
        { id: 'val-1', slug: 'chase', user_help_text: 'help', updated_at: '2026-01-01' },
      ]
      mockGet.mockResolvedValueOnce({ results })

      const result = await getReferralProgramValidations('program-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/program-1/referral-program/validations')
      expect(result).toEqual({ results })
    })

    it('returns empty results when no validations are linked', async () => {
      mockGet.mockResolvedValueOnce({ results: [] })

      const result = await getReferralProgramValidations('program-empty')

      expect(result).toEqual({ results: [] })
    })
  })
})
