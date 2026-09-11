import { describe, expect, it } from 'vitest'
import { parseCreateUserWarningInput } from '../parse.mts'
import {
  USER_WARNING_PUBLIC_MESSAGE_MAX_LENGTH,
  USER_WARNING_REASON_MAX_LENGTH,
} from '../config.mts'

const VALID_UUID = '00000000-0000-0000-0000-000000000001'
const VALID_UUID2 = '00000000-0000-0000-0000-000000000002'

describe('parseCreateUserWarningInput', () => {
  describe('userId', () => {
    it('accepts a valid UUID', () => {
      const result = parseCreateUserWarningInput({ userId: VALID_UUID, reason: 'test' })
      expect(result.userId).toBe(VALID_UUID)
    })

    it('throws 422 when userId is missing', () => {
      expect(() => parseCreateUserWarningInput({ reason: 'test' })).toThrow('Invalid userId')
    })

    it('throws 422 when userId is not a UUID', () => {
      expect(() => parseCreateUserWarningInput({ userId: 'not-a-uuid', reason: 'test' })).toThrow(
        'Invalid userId',
      )
    })

    it('throws 422 when userId is a number', () => {
      expect(() => parseCreateUserWarningInput({ userId: 42, reason: 'test' })).toThrow(
        'Invalid userId',
      )
    })
  })

  describe('reason', () => {
    it('accepts a non-empty reason', () => {
      const result = parseCreateUserWarningInput({ userId: VALID_UUID, reason: 'Violated rules' })
      expect(result.reason).toBe('Violated rules')
    })

    it('trims whitespace from reason', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: '  spam content  ',
      })
      expect(result.reason).toBe('spam content')
    })

    it('throws 422 when reason is missing', () => {
      expect(() => parseCreateUserWarningInput({ userId: VALID_UUID })).toThrow(
        'reason is required',
      )
    })

    it('throws 422 when reason is empty string', () => {
      expect(() => parseCreateUserWarningInput({ userId: VALID_UUID, reason: '' })).toThrow(
        'reason is required',
      )
    })

    it('throws 422 when reason is whitespace only', () => {
      expect(() => parseCreateUserWarningInput({ userId: VALID_UUID, reason: '   ' })).toThrow(
        'reason is required',
      )
    })

    it('throws 422 when reason exceeds max length', () => {
      expect(() =>
        parseCreateUserWarningInput({
          userId: VALID_UUID,
          reason: 'x'.repeat(USER_WARNING_REASON_MAX_LENGTH + 1),
        }),
      ).toThrow('reason is too long')
    })

    it('accepts reason at exactly max length', () => {
      const reason = 'x'.repeat(USER_WARNING_REASON_MAX_LENGTH)
      const result = parseCreateUserWarningInput({ userId: VALID_UUID, reason })
      expect(result.reason).toBe(reason)
    })
  })

  describe('publicMessage', () => {
    it('defaults to null when not provided', () => {
      const result = parseCreateUserWarningInput({ userId: VALID_UUID, reason: 'test' })
      expect(result.publicMessage).toBeNull()
    })

    it('defaults to null when null is passed', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        publicMessage: null,
      })
      expect(result.publicMessage).toBeNull()
    })

    it('accepts a string public message', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        publicMessage: 'Please follow the rules.',
      })
      expect(result.publicMessage).toBe('Please follow the rules.')
    })

    it('trims whitespace from publicMessage', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        publicMessage: '  hello  ',
      })
      expect(result.publicMessage).toBe('hello')
    })

    it('returns null when publicMessage is empty after trim', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        publicMessage: '   ',
      })
      expect(result.publicMessage).toBeNull()
    })

    it('throws 422 when publicMessage exceeds max length', () => {
      expect(() =>
        parseCreateUserWarningInput({
          userId: VALID_UUID,
          reason: 'test',
          publicMessage: 'x'.repeat(USER_WARNING_PUBLIC_MESSAGE_MAX_LENGTH + 1),
        }),
      ).toThrow('publicMessage is too long')
    })

    it('accepts publicMessage at exactly max length', () => {
      const msg = 'x'.repeat(USER_WARNING_PUBLIC_MESSAGE_MAX_LENGTH)
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        publicMessage: msg,
      })
      expect(result.publicMessage).toBe(msg)
    })

    it('throws 422 when publicMessage is not a string or null', () => {
      expect(() =>
        parseCreateUserWarningInput({
          userId: VALID_UUID,
          reason: 'test',
          publicMessage: 42,
        }),
      ).toThrow('Invalid publicMessage')
    })
  })

  describe('communityId', () => {
    it('defaults to null when not provided', () => {
      const result = parseCreateUserWarningInput({ userId: VALID_UUID, reason: 'test' })
      expect(result.communityId).toBeNull()
    })

    it('defaults to null when null is passed', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        communityId: null,
      })
      expect(result.communityId).toBeNull()
    })

    it('accepts a valid UUID communityId', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        communityId: VALID_UUID2,
      })
      expect(result.communityId).toBe(VALID_UUID2)
    })

    it('throws 422 when communityId is not a UUID', () => {
      expect(() =>
        parseCreateUserWarningInput({
          userId: VALID_UUID,
          reason: 'test',
          communityId: 'not-a-uuid',
        }),
      ).toThrow('Invalid communityId')
    })
  })

  describe('reportId', () => {
    it('defaults to null when not provided', () => {
      const result = parseCreateUserWarningInput({ userId: VALID_UUID, reason: 'test' })
      expect(result.reportId).toBeNull()
    })

    it('accepts a valid UUID reportId', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        reportId: VALID_UUID2,
      })
      expect(result.reportId).toBe(VALID_UUID2)
    })

    it('throws 422 when reportId is not a UUID', () => {
      expect(() =>
        parseCreateUserWarningInput({
          userId: VALID_UUID,
          reason: 'test',
          reportId: 'not-a-uuid',
        }),
      ).toThrow('Invalid reportId')
    })
  })

  describe('resolveReport', () => {
    it('defaults to false when not provided', () => {
      const result = parseCreateUserWarningInput({ userId: VALID_UUID, reason: 'test' })
      expect(result.resolveReport).toBe(false)
    })

    it('accepts true', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        resolveReport: true,
      })
      expect(result.resolveReport).toBe(true)
    })

    it('accepts false', () => {
      const result = parseCreateUserWarningInput({
        userId: VALID_UUID,
        reason: 'test',
        resolveReport: false,
      })
      expect(result.resolveReport).toBe(false)
    })

    it('throws 422 when resolveReport is not a boolean', () => {
      expect(() =>
        parseCreateUserWarningInput({
          userId: VALID_UUID,
          reason: 'test',
          resolveReport: 'yes',
        }),
      ).toThrow('Invalid resolveReport')
    })
  })
})
