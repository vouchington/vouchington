import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { readCopyrightThreadReferenceState } from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  deleteCopyrightThreadTokenBeforeQueryForTest,
  readCopyrightThreadTokenById,
  seedCopyrightThreadTokenAtForTest,
} from '@voucha/test-helpers/copyright-thread-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import {
  insertResolvedCopyrightEmailThreadReferences,
  resolveCopyrightEmailThreadTokenIds,
} from './email-thread-ancestors.mts'
import { insertCopyrightEmailIntakeNoticeLink } from './email-thread-link.mts'
import { buildCopyrightEmailThreadReferenceRows } from './email-thread-references.mts'

function digestFor(messageId: string): string {
  return buildCopyrightEmailThreadReferenceRows({
    messageId,
    inReplyTo: [],
    references: [],
  })[0]!.lookup_digest
}

describe('copyright email token GC races', () => {
  it('returns a conflict when an orphan disappears before token resolution', async () => {
    const digest = digestFor(`token-${randomUUID()}@example.test`)
    const tokenId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      lookupDigest: digest,
    })
    await expect(
      deleteCopyrightThreadTokenBeforeQueryForTest(
        tokenId,
        'resolveCopyrightEmailThreadTokenIds:read',
        query => resolveCopyrightEmailThreadTokenIds(query, [digest]),
      ),
    ).rejects.toMatchObject({ status: 409, code: COPYRIGHT_EMAIL_THREAD_CHANGED })
    expect(await readCopyrightThreadTokenById(tokenId)).toBeNull()
  })

  it('returns a conflict when GC removes the token before a reference insert', async () => {
    const intake = await createRetentionParsedEmail('token-reference-fk-race')
    const before = await readCopyrightThreadReferenceState(intake.id)
    const digest = digestFor(`token-${randomUUID()}@example.test`)
    const tokenId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      lookupDigest: digest,
    })
    await expect(
      deleteCopyrightThreadTokenBeforeQueryForTest(
        tokenId,
        '/* insertCopyrightEmailThreadReferences */',
        query =>
          insertResolvedCopyrightEmailThreadReferences(
            query,
            intake.id,
            [{ lookup_digest: digest, reference_kind: 'message_id' }],
            new Map([[digest, tokenId]]),
          ),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      cause: { code: '23503', constraint: 'fk_copyright_notice_email_thread_references__token' },
    })
    expect((await readCopyrightThreadReferenceState(intake.id)).referenceCount).toBe(
      before.referenceCount,
    )
    expect(await readCopyrightThreadTokenById(tokenId)).toBeNull()
  })

  it('returns a conflict when GC removes the matched token before a link insert', async () => {
    const notice = await createRetentionMinimalCase()
    const intake = await createRetentionParsedEmail('token-link-fk-race')
    const matchedReference = `token-${randomUUID()}@example.test`
    const tokenId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      lookupDigest: digestFor(matchedReference),
    })
    await expect(
      deleteCopyrightThreadTokenBeforeQueryForTest(
        tokenId,
        '/* linkCopyrightEmailIntakeToNotice */',
        query =>
          insertCopyrightEmailIntakeNoticeLink(query, {
            intakeId: intake.id,
            noticeId: notice.noticeId,
            linkKind: 'thread',
            matchedReference,
          }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
      cause: {
        code: '23503',
        constraint: 'fk_copyright_notice_email_intake_notice_links__matched_token',
      },
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    expect(await readCopyrightThreadTokenById(tokenId)).toBeNull()
  })
})
