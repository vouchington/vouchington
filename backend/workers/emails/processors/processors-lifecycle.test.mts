import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import { createTestUser, createTestUserDirect } from '@voucha/test-helpers'
import { processSendCommunityApplicationDecisionEmail } from './community-application-decision.mts'
import { processSendCommunityOwnershipTransferEmail } from './community-ownership-transfer.mts'
import { processSendCommunityRoleChangeEmail } from './community-role-change.mts'
import { processSendWelcomeEmail } from './welcome.mts'
import { deleteUser } from '../../../services/users/delete.mts'

describe('processSendWelcomeEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('renders welcome email and sends via SES', async () => {
    await processSendWelcomeEmail({ emailAddress: 'tests+user@voucha.ai' }, { userName: 'Alex' })

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+user@voucha.ai',
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
  })

  it('revalidates the recipient by userId before sending', async () => {
    const user = await createTestUser()
    await processSendWelcomeEmail(
      { emailAddress: 'tests+stale@voucha.ai', userId: user!.id },
      { userName: 'Alex' },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
  })

  it('skips a legacy queued address when the recipient has no verified email', async () => {
    const user = await createTestUserDirect({ withEmail: false })
    await expect(
      processSendWelcomeEmail(
        { emailAddress: 'tests+oauth@voucha.ai', userId: user!.id },
        { userName: 'Alex' },
      ),
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'no_verified_email',
      userId: user!.id,
    })
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})

describe('processSendCommunityApplicationDecisionEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('revalidates the recipient by userId before sending', async () => {
    const user = await createTestUser()
    await processSendCommunityApplicationDecisionEmail(
      { emailAddress: 'tests+stale@voucha.ai', userId: user!.id },
      {
        communityName: 'Test Community',
        communityUrl: 'https://voucha.ai/communities/test-community',
        status: 'approved',
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: expect.stringContaining('approved'),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
  })

  it('includes the rejection reason for a rejected decision', async () => {
    await processSendCommunityApplicationDecisionEmail(
      { emailAddress: 'tests+user@voucha.ai' },
      {
        communityName: 'Test Community',
        communityUrl: 'https://voucha.ai/communities/test-community',
        status: 'rejected',
        rejectionReason: 'Community guidelines were not met',
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('rejected'),
        html: expect.stringContaining('Community guidelines were not met'),
        text: expect.stringContaining('Community guidelines were not met'),
      }),
    )
  })
})

describe('processSendCommunityRoleChangeEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('revalidates the recipient by userId before sending', async () => {
    const user = await createTestUser()
    await processSendCommunityRoleChangeEmail(
      { emailAddress: 'tests+stale@voucha.ai', userId: user!.id },
      {
        communityName: 'Test Community',
        communityUrl: 'https://voucha.ai/communities/test-community',
        newRole: 'moderator',
        direction: 'promoted',
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
  })

  it('renders a demotion email and sends via SES', async () => {
    await processSendCommunityRoleChangeEmail(
      { emailAddress: 'tests+user@voucha.ai' },
      {
        communityName: 'Test Community',
        communityUrl: 'https://voucha.ai/communities/test-community',
        newRole: 'member',
        direction: 'demoted',
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+user@voucha.ai',
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
  })
})

describe('processSendCommunityOwnershipTransferEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('revalidates the recipient by userId before sending', async () => {
    const user = await createTestUser()
    await processSendCommunityOwnershipTransferEmail(
      { emailAddress: 'tests+stale@voucha.ai', userId: user!.id },
      {
        communityName: 'Test Community',
        communityUrl: 'https://voucha.ai/communities/test-community',
        recipientRole: 'new_owner',
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
  })

  it('renders a previous-owner email and sends via SES', async () => {
    await processSendCommunityOwnershipTransferEmail(
      { emailAddress: 'tests+user@voucha.ai' },
      {
        communityName: 'Test Community',
        communityUrl: 'https://voucha.ai/communities/test-community',
        recipientRole: 'previous_owner',
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'tests+user@voucha.ai',
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      }),
    )
  })
})

describe('lifecycle email processors skip deleted recipients', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('returns a typed skip and does not send when the recipient account was deleted', async () => {
    const user = await createTestUser()
    await deleteUser(user!, user!)
    const skipped = {
      status: 'skipped',
      reason: 'no_verified_email',
      userId: user!.id,
    }

    await expect(
      processSendWelcomeEmail(
        { emailAddress: 'tests+stale@voucha.ai', userId: user!.id },
        { userName: 'Alex' },
      ),
    ).resolves.toEqual(skipped)
    await expect(
      processSendCommunityApplicationDecisionEmail(
        { emailAddress: 'tests+stale@voucha.ai', userId: user!.id },
        {
          communityName: 'Test Community',
          communityUrl: 'https://voucha.ai/communities/test-community',
          status: 'approved',
        },
      ),
    ).resolves.toEqual(skipped)
    await expect(
      processSendCommunityRoleChangeEmail(
        { emailAddress: 'tests+stale@voucha.ai', userId: user!.id },
        {
          communityName: 'Test Community',
          communityUrl: 'https://voucha.ai/communities/test-community',
          newRole: 'moderator',
          direction: 'promoted',
        },
      ),
    ).resolves.toEqual(skipped)
    await expect(
      processSendCommunityOwnershipTransferEmail(
        { emailAddress: 'tests+stale@voucha.ai', userId: user!.id },
        {
          communityName: 'Test Community',
          communityUrl: 'https://voucha.ai/communities/test-community',
          recipientRole: 'new_owner',
        },
      ),
    ).resolves.toEqual(skipped)
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})
