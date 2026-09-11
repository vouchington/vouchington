import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport } from '@voucha/test-helpers'
import { createUserWarning } from '../create.mts'
import { listReceivedUserWarnings } from '../get.mts'
import type { PrivateUser } from '@services/users/types'

describe('createUserWarning', () => {
  let issuer: PrivateUser
  let targetUser: PrivateUser

  beforeAll(async () => {
    ;[issuer, targetUser] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('creates a warning and returns it', async () => {
    const warning = await createUserWarning(issuer.id, {
      userId: targetUser.id,
      reason: 'Violated community guidelines',
      publicMessage: 'Please review the rules.',
      communityId: null,
      reportId: null,
      resolveReport: false,
    })

    expect(warning.id).toBeDefined()
    expect(warning.user_id).toBe(targetUser.id)
    expect(warning.issued_by_id).toBe(issuer.id)
    expect(warning.reason).toBe('Violated community guidelines')
    expect(warning.public_message).toBe('Please review the rules.')
    expect(warning.community_id).toBeNull()
    expect(warning.report_id).toBeNull()
    expect(warning.created_at).toBeInstanceOf(Date)
  })

  it('creates a warning with null publicMessage', async () => {
    const warning = await createUserWarning(issuer.id, {
      userId: targetUser.id,
      reason: 'Spam',
      publicMessage: null,
      communityId: null,
      reportId: null,
      resolveReport: false,
    })

    expect(warning.public_message).toBeNull()
  })

  it('persists the warning so it appears in the list', async () => {
    const uniqueReason = `create-persist-test-${crypto.randomUUID()}`
    const publicMessage = `create-persist-public-${crypto.randomUUID()}`
    const warning = await createUserWarning(issuer.id, {
      userId: targetUser.id,
      reason: uniqueReason,
      publicMessage,
      communityId: null,
      reportId: null,
      resolveReport: false,
    })

    const { warnings } = await listReceivedUserWarnings(targetUser.id)
    const found = warnings.find(w => w.id === warning.id)
    expect(found).toBeDefined()
    expect(found?.public_message).toBe(publicMessage)
  })

  it('throws 422 for a non-existent community UUID (FK violation)', async () => {
    const nonExistentCommunityId = crypto.randomUUID()
    let caughtError: unknown
    try {
      await createUserWarning(issuer.id, {
        userId: targetUser.id,
        reason: 'FK violation test',
        publicMessage: null,
        communityId: nonExistentCommunityId,
        reportId: null,
        resolveReport: false,
      })
    } catch (err) {
      caughtError = err
    }
    expect(caughtError).toBeDefined()
    expect((caughtError as { status?: number }).status).toBe(422)
  })

  it('can return an existing warning for report retry paths', async () => {
    const { insertTestPost } = await import('@voucha/test-helpers')
    const postOwner = await createTestUser()
    const postId = await insertTestPost({
      createdById: postOwner.id,
      slug: `retry-report-warning-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for retry report warning test',
      markdown: 'Content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: issuer.id,
      entityType: 'post',
      entityId: postId,
    })

    const first = await createUserWarning(issuer.id, {
      userId: postOwner.id,
      reason: 'First warning for retry report',
      publicMessage: null,
      communityId: null,
      reportId,
      resolveReport: false,
    })

    const retry = await createUserWarning(
      issuer.id,
      {
        userId: postOwner.id,
        reason: 'Retry warning for same report',
        publicMessage: null,
        communityId: null,
        reportId,
        resolveReport: false,
      },
      { returnExistingForReport: true },
    )

    expect(retry.id).toBe(first.id)
  })

  it('throws 409 when two warnings are created with the same reportId', async () => {
    const { insertTestPost } = await import('@voucha/test-helpers')
    const postOwner = await createTestUser()
    const postId = await insertTestPost({
      createdById: postOwner.id,
      slug: `dup-report-warning-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for duplicate report warning test',
      markdown: 'Content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: issuer.id,
      entityType: 'post',
      entityId: postId,
    })

    await createUserWarning(issuer.id, {
      userId: postOwner.id,
      reason: 'First warning for report',
      publicMessage: null,
      communityId: null,
      reportId,
      resolveReport: false,
    })

    let caughtError: unknown
    try {
      await createUserWarning(issuer.id, {
        userId: postOwner.id,
        reason: 'Duplicate warning for same report',
        publicMessage: null,
        communityId: null,
        reportId,
        resolveReport: false,
      })
    } catch (err) {
      caughtError = err
    }
    expect(caughtError).toBeDefined()
    expect((caughtError as { status?: number }).status).toBe(409)
  })

  it('creates warnings for different users independently', async () => {
    const anotherTarget = await createTestUser()

    const warningA = await createUserWarning(issuer.id, {
      userId: targetUser.id,
      reason: `for-target-${crypto.randomUUID()}`,
      publicMessage: null,
      communityId: null,
      reportId: null,
      resolveReport: false,
    })
    const warningB = await createUserWarning(issuer.id, {
      userId: anotherTarget.id,
      reason: `for-another-${crypto.randomUUID()}`,
      publicMessage: null,
      communityId: null,
      reportId: null,
      resolveReport: false,
    })

    expect(warningA.user_id).toBe(targetUser.id)
    expect(warningB.user_id).toBe(anotherTarget.id)
    expect(warningA.id).not.toBe(warningB.id)
  })
})
