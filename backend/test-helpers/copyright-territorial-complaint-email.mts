import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from './services/copyright-notices/email-ses-verdicts.mts'
import {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '../services/copyright-notices/index.mts'
import { linkCopyrightEmailIntakeToNotice } from '../services/copyright-notices/email-threading.mts'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'

export async function createTestThreadedTerritorialComplaintEmail(input: {
  noticeId: string
  senderEmail: string
  receivedAt?: Date
}) {
  const sesMessageId = `ses-territorial-complaint-${crypto.randomUUID()}`
  const receivedAt = input.receivedAt ?? new Date()
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt,
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 3),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
  })
  await recordCopyrightEmailParse(intake, {
    status: 'succeeded',
    fromEmail: input.senderEmail,
    subject: 'Re: EU copyright notice decision',
    bodyText: 'I ask staff to reconsider the decision.',
    messageId: `<${crypto.randomUUID()}@example.test>`,
    replyReferences: [],
    attachments: [],
  })
  await linkCopyrightEmailIntakeToNotice({
    intakeId: intake.id,
    noticeId: input.noticeId,
    linkKind: 'thread',
  })
  return { intake, sesMessageId, receivedAt }
}

export async function readTestTerritorialComplaintEmailRecords(noticeId: string) {
  const [{ rows: requests }, { rows: submissions }] = await Promise.all([
    read<{ id: string; submitted_by_id: string | null; received_at: Date }>(sql`
      /* readTestTerritorialComplaintEmailRecords:requests */
      SELECT id, submitted_by_id, received_at
      FROM copyright_territorial_redress_requests
      WHERE copyright_notice_id = ${noticeId}
      ORDER BY id
    `),
    read<{ id: string; kind: string; received_at: Date }>(sql`
      /* readTestTerritorialComplaintEmailRecords:submissions */
      SELECT id, kind, received_at
      FROM copyright_notice_submissions
      WHERE copyright_notice_id = ${noticeId} AND kind = 'complaint'
      ORDER BY id
    `),
  ])
  return { requests, submissions }
}

export async function admitTestGuestTerritorialComplaintEmail(input: {
  currentUser: Parameters<typeof admitCopyrightEmailCorrespondence>[0]['currentUser']
  noticeId: string
  senderEmail: string
  receivedAt?: Date
}) {
  const email = await createTestThreadedTerritorialComplaintEmail(input)
  const admitted = await admitCopyrightEmailCorrespondence({
    currentUser: input.currentUser,
    intakeId: email.intake.id,
    kind: 'complaint',
    targetIds: [],
    structuredSubmission: { summary: 'Please reconsider the decision.' },
    rationale: 'The email is a valid guest complaint reply.',
    recommendationId: null,
    manualFallbackReason: 'No agent recommendation was available.',
  })
  return { email, admitted }
}
