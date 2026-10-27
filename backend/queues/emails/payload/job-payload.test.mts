import { describe, expect, it } from 'vitest'
import { parseEmailJob } from './job-payload.mts'

const address = { emailAddress: 'owner@example.test' }

describe('parseEmailJob', () => {
  it('rejects unknown jobs, including the email-digests jobs that left this queue', () => {
    expect(() => parseEmailJob('missingJob', {})).toThrow(/unknown job missingJob/)
    expect(() => parseEmailJob('dispatchEngagementEmails', {})).toThrow(/unknown job/)
    expect(() => parseEmailJob('processSendFollowTopicsEmail', {})).toThrow(/unknown job/)
    expect(() => parseEmailJob('toString', {})).toThrow(/unknown job toString/)
  })

  it('validates the dedicated reauthentication code and expiry payload', () => {
    const payload = { input: address, variables: { token: 'ABCDEFG234', expiresInMinutes: 15 } }
    expect(parseEmailJob('processSendReauthenticationToken', payload)).toMatchObject({
      kind: 'template',
      name: 'processSendReauthenticationToken',
      ...payload,
    })
    for (const expiresInMinutes of [undefined, '15', 0, -1, 1.5, Infinity]) {
      expect(() =>
        parseEmailJob('processSendReauthenticationToken', {
          ...payload,
          variables: { token: 'ABCDEFG234', expiresInMinutes },
        }),
      ).toThrow('expiresInMinutes must be a positive integer')
    }
  })

  it('keeps account-security notices free of attacker-supplied template variables', () => {
    expect(
      parseEmailJob('processSendAccountSecurityEmail', {
        input: address,
        variables: {},
      }),
    ).toMatchObject({ name: 'processSendAccountSecurityEmail', variables: {} })
    expect(() =>
      parseEmailJob('processSendAccountSecurityEmail', {
        input: address,
        variables: { link: 'https://wrong.example.test' },
      }),
    ).toThrow(/unexpected property link/)
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
        input: { userId: 'user', uiLocale: 'fr' },
        variables: { requestId: 'request' },
      }),
    ).toMatchObject({
      kind: 'template',
      variables: { requestId: 'request' },
    })
    expect(() =>
      parseEmailJob('processSendDataExportReadyEmail', {
        input: { userId: 'user' },
        variables: { downloadUrl: 'https://example.test/file', expiresInDays: 2 },
      }),
    ).toThrow(/unexpected property downloadUrl/)
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
