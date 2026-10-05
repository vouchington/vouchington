import { describe, expect, it } from 'vitest'
import { parseEmailJob } from './job-payload.mts'

const address = { emailAddress: 'owner@example.test' }

describe('parseEmailJob', () => {
  it('accepts empty dispatcher payloads and rejects unknown jobs', () => {
    expect(parseEmailJob('dispatchEngagementEmails', null)).toEqual({
      kind: 'dispatcher',
      data: {},
      name: 'dispatchEngagementEmails',
    })
    expect(parseEmailJob('dispatchCommunityModerationSummaryEmails', undefined)).toEqual({
      kind: 'dispatcher',
      data: {},
      name: 'dispatchCommunityModerationSummaryEmails',
    })
    expect(parseEmailJob('dispatchEngagementEmails', {}).kind).toBe('dispatcher')
    expect(() => parseEmailJob('dispatchEngagementEmails', { extra: true })).toThrow(
      /unexpected property extra/,
    )
    expect(() => parseEmailJob('missingJob', {})).toThrow(/unknown job missingJob/)
    expect(parseEmailJob('dispatchApiKeyExpiryReminders', { afterId: 'owned-cursor' })).toEqual({
      kind: 'dispatcher',
      name: 'dispatchApiKeyExpiryReminders',
      data: { afterId: 'owned-cursor' },
    })
    expect(() => parseEmailJob('dispatchApiKeyExpiryReminders', { afterId: 1 })).toThrow(
      /afterId must be a string/,
    )
  })

  it('accepts only a durable UUID for API-key expiry jobs', () => {
    const apiKeyId = '00000000-0000-7000-8000-000000000042'
    expect(parseEmailJob('processSendApiKeyExpiryReminder', { apiKeyId })).toEqual({
      kind: 'api-key-expiry',
      apiKeyId,
    })
    expect(() => parseEmailJob('processSendApiKeyExpiryReminder', {})).toThrow(/must be a UUID/)
    expect(() => parseEmailJob('processSendApiKeyExpiryReminder', { apiKeyId: 42 })).toThrow(
      /must be a UUID/,
    )
    expect(() =>
      parseEmailJob('processSendApiKeyExpiryReminder', { apiKeyId: 'not-a-uuid' }),
    ).toThrow(/must be a UUID/)
    expect(() =>
      parseEmailJob('processSendApiKeyExpiryReminder', { apiKeyId, rawKey: 'secret' }),
    ).toThrow(/unexpected property rawKey/)
    expect(() => parseEmailJob('dispatchApiKeyExpiryReminders', { apiKeyId })).toThrow(
      /unexpected property apiKeyId/,
    )
  })

  it('accepts exactly one copyright delivery intent identifier', () => {
    expect(parseEmailJob('processSendCopyrightNoticeEmail', { intentId: 'intent' })).toEqual({
      kind: 'copyright',
      data: { intentId: 'intent' },
    })
    expect(() =>
      parseEmailJob('processSendCopyrightNoticeEmail', { intentId: 'intent', extra: 'x' }),
    ).toThrow(/unexpected property extra/)
    expect(() => parseEmailJob('processSendCopyrightNoticeEmail', {})).toThrow(/must set intentId/)
  })

  it('parses template variables and input metadata', () => {
    expect(
      parseEmailJob('processSendWelcomeEmail', {
        input: { userId: 'user', uiLocale: null, trackingKey: 'track' },
        variables: { userName: 'Ada', uiLocale: 'en' },
      }).kind,
    ).toBe('template')
    expect(
      parseEmailJob('processSendCommunityInviteEmail', {
        input: address,
        variables: { communityName: 'Voucha', inviterName: 'Ada', code: 'code' },
      }).kind,
    ).toBe('template')
    expect(
      parseEmailJob('processSendEmailAddressLoginToken', {
        input: {
          ...address,
          windowStart: 'start',
          windowEnd: 'end',
          subject: 's',
          text: 't',
          html: 'h',
        },
        variables: { token: 'token', expiration: 'soon' },
      }).kind,
    ).toBe('template')
    expect(
      parseEmailJob('processSendEmailVerificationToken', {
        input: address,
        variables: { token: 'token' },
      }).kind,
    ).toBe('template')
    expect(
      parseEmailJob('processSendDataExportReadyEmail', {
        input: address,
        variables: { downloadUrl: 'https://example.test/file', expiresInDays: 2 },
      }).kind,
    ).toBe('template')
    expect(() =>
      parseEmailJob('processSendDataExportReadyEmail', {
        input: address,
        variables: { downloadUrl: 'https://example.test/file', expiresInDays: Number.NaN },
      }),
    ).toThrow(/expiresInDays must be a number/)
    expect(
      parseEmailJob('processSendCommunityApplicationDecisionEmail', {
        input: address,
        variables: {
          communityName: 'Voucha',
          communityUrl: 'https://example.test/c',
          status: 'approved',
          rejectionReason: 'later',
        },
      }).kind,
    ).toBe('template')
    expect(() =>
      parseEmailJob('processSendCommunityApplicationDecisionEmail', {
        input: address,
        variables: {
          communityName: 'Voucha',
          communityUrl: 'https://example.test/c',
          status: 'wait',
        },
      }),
    ).toThrow(/status is not a known value/)
    expect(
      parseEmailJob('processSendCommunityRoleChangeEmail', {
        input: address,
        variables: {
          communityName: 'Voucha',
          communityUrl: 'https://example.test/c',
          newRole: 'moderator',
          direction: 'promoted',
        },
      }).kind,
    ).toBe('template')
    expect(() =>
      parseEmailJob('processSendCommunityRoleChangeEmail', {
        input: address,
        variables: {
          communityName: 'Voucha',
          communityUrl: 'https://example.test/c',
          newRole: 'guest',
          direction: 'promoted',
        },
      }),
    ).toThrow(/newRole is not a known value/)
    expect(
      parseEmailJob('processSendCommunityOwnershipTransferEmail', {
        input: address,
        variables: {
          communityName: 'Voucha',
          communityUrl: 'https://example.test/c',
          recipientRole: 'previous_owner',
        },
      }).kind,
    ).toBe('template')
    expect(() =>
      parseEmailJob('processSendCommunityOwnershipTransferEmail', {
        input: address,
        variables: {
          communityName: 'Voucha',
          communityUrl: 'https://example.test/c',
          recipientRole: 'member',
        },
      }),
    ).toThrow(/recipientRole is not a known value/)
    expect(() => parseEmailJob('processSendWelcomeEmail', { input: {}, variables: {} })).toThrow(
      /emailAddress or userId/,
    )
    expect(() =>
      parseEmailJob('processSendWelcomeEmail', {
        input: { emailAddress: 'owner@example.test', userId: 'user' },
        variables: {},
      }),
    ).toThrow(/emailAddress or userId/)
    expect(() =>
      parseEmailJob('processSendWelcomeEmail', {
        input: { ...address, trackingKey: 1 },
        variables: {},
      }),
    ).toThrow(/trackingKey must be a string/)
    expect(() =>
      parseEmailJob('processSendWelcomeEmail', {
        input: { ...address, uiLocale: 1 },
        variables: {},
      }),
    ).toThrow(/uiLocale must be a string or null/)
  })
})
