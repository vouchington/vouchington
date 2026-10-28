import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  getReferralLinkValidation,
  createReferralLinkValidation,
  updateReferralLinkValidation,
  createReferralLinkValidationRule,
  updateReferralLinkValidationRule,
  deleteReferralLinkValidationRule,
  linkValidationToReferralProgram,
  unlinkValidationFromReferralProgram,
  createAndLinkValidationToReferralProgram,
} from '../referral-link-validations'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)
const mockPatch = vi.mocked(clientApi.patch)
const mockDelete = vi.mocked(clientApi.delete)

describe('referral-link-validations client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getReferralLinkValidation', () => {
    it('calls GET with the correct endpoint', async () => {
      const resp = {
        validation: { id: 'val-1', slug: 'chase', user_help_text: '', updated_at: '' },
      }
      mockGet.mockResolvedValueOnce(resp)

      const result = await getReferralLinkValidation('chase')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/referral-link-validations/chase')
      expect(result).toBe(resp)
    })
  })

  describe('createReferralLinkValidation', () => {
    it('calls POST with slug and user_help_text', async () => {
      const resp = {
        validation: { id: 'val-1', slug: 'chase', user_help_text: 'help', updated_at: '' },
      }
      mockPost.mockResolvedValueOnce(resp)

      const result = await createReferralLinkValidation({ slug: 'chase', user_help_text: 'help' })

      expect(mockPost).toHaveBeenCalledWith('/api/v1/referral-link-validations', {
        slug: 'chase',
        user_help_text: 'help',
      })
      expect(result).toBe(resp)
    })
  })

  describe('updateReferralLinkValidation', () => {
    it('calls PATCH with the correct endpoint and data', async () => {
      const resp = {
        validation: { id: 'val-1', slug: 'new-slug', user_help_text: '', updated_at: '' },
      }
      mockPatch.mockResolvedValueOnce(resp)

      const result = await updateReferralLinkValidation('val-1', { slug: 'new-slug' })

      expect(mockPatch).toHaveBeenCalledWith('/api/v1/referral-link-validations/val-1', {
        slug: 'new-slug',
      })
      expect(result).toBe(resp)
    })
  })

  describe('createReferralLinkValidationRule', () => {
    it('calls POST with the correct endpoint and data', async () => {
      const resp = {
        validation_rule: {
          id: 'rule-1',
          referral_program_link_validation_id: 'val-1',
          hostname: 'chase.com',
          pathname: '/ref/%',
          is_referral_link_url: true,
          is_invalid_referral_link_url: false,
          user_error_text: null,
          example_urls: null,
        },
      }
      mockPost.mockResolvedValueOnce(resp)

      const result = await createReferralLinkValidationRule('val-1', {
        hostname: 'chase.com',
        pathname: '/ref/%',
      })

      expect(mockPost).toHaveBeenCalledWith('/api/v1/referral-link-validations/val-1/rules', {
        hostname: 'chase.com',
        pathname: '/ref/%',
      })
      expect(result).toBe(resp)
    })
  })

  describe('updateReferralLinkValidationRule', () => {
    it('calls PATCH with the correct endpoint and data', async () => {
      const resp = {
        validation_rule: {
          id: 'rule-1',
          referral_program_link_validation_id: 'val-1',
          hostname: 'new.com',
          pathname: '/ref/%',
          is_referral_link_url: true,
          is_invalid_referral_link_url: false,
          user_error_text: null,
          example_urls: null,
        },
      }
      mockPatch.mockResolvedValueOnce(resp)

      const result = await updateReferralLinkValidationRule('val-1', 'rule-1', {
        hostname: 'new.com',
      })

      expect(mockPatch).toHaveBeenCalledWith(
        '/api/v1/referral-link-validations/val-1/rules/rule-1',
        { hostname: 'new.com' },
      )
      expect(result).toBe(resp)
    })
  })

  describe('deleteReferralLinkValidationRule', () => {
    it('calls DELETE with the correct endpoint', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      await deleteReferralLinkValidationRule('val-1', 'rule-1')

      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/referral-link-validations/val-1/rules/rule-1',
      )
    })
  })

  describe('linkValidationToReferralProgram', () => {
    it('calls POST with validation_id in the body', async () => {
      mockPost.mockResolvedValueOnce(undefined)

      await linkValidationToReferralProgram('program-1', 'val-1')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/topics/program-1/referral-program/link-validations',
        { validation_id: 'val-1' },
      )
    })
  })

  describe('unlinkValidationFromReferralProgram', () => {
    it('calls DELETE with the correct endpoint', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      await unlinkValidationFromReferralProgram('program-1', 'val-1')

      expect(mockDelete).toHaveBeenCalledWith(
        '/api/v1/topics/program-1/referral-program/link-validations/val-1',
      )
    })
  })

  describe('createAndLinkValidationToReferralProgram', () => {
    it('posts to the correct URL', async () => {
      const fakeValidation = { id: 'val-1', slug: 'test-slug', user_help_text: '', updated_at: '' }
      mockPost.mockResolvedValueOnce({ validation: fakeValidation })

      await createAndLinkValidationToReferralProgram('prog-1', { slug: 'test-slug' })

      expect(mockPost).toHaveBeenCalledWith('/api/v1/topics/prog-1/referral-program/validations', {
        slug: 'test-slug',
      })
    })
  })
})
