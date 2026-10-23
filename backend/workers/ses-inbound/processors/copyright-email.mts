import {
  assertCopyrightEmailRetainedDigest,
  type createCopyrightEmailIntake,
  type recordCopyrightEmailParse,
  type withCopyrightEmailIntakeIdentityLock,
} from '@services/copyright-notices'
import type { enqueueCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import type { SesInboundProcessJobData } from '@ts-shared/ses-inbound-contract'
import { SesInboundTerminalError, type parseSesInboundMime } from './mime.mts'
import type { SesInboundRawDigest } from './raw-mime-digest.mts'
import type {
  copySesInboundObjectToCopyrightEvidence,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
} from './s3.mts'

export type CopyrightEmailDependencies = {
  copySesInboundObjectToCopyrightEvidence: typeof copySesInboundObjectToCopyrightEvidence
  createCopyrightEmailIntake: typeof createCopyrightEmailIntake
  withCopyrightEmailIntakeIdentityLock: typeof withCopyrightEmailIntakeIdentityLock
  enqueueCopyrightEmailIntake: typeof enqueueCopyrightEmailIntake
  loadSesInboundObjectAndHash: typeof loadSesInboundObjectAndHash
  loadSesInboundObjectVersion: typeof loadSesInboundObjectVersion
  parseSesInboundMime: typeof parseSesInboundMime
  recordCopyrightEmailParse: typeof recordCopyrightEmailParse
}

export async function processCopyrightInboundEmail(
  data: SesInboundProcessJobData,
  dependencies: CopyrightEmailDependencies,
): Promise<void> {
  const preserved = await preserveCopyrightEvidence(data, dependencies)
  if (!preserved) return
  const { intake, sourceIdentity } = preserved
  try {
    const email = await dependencies.parseSesInboundMime(
      await dependencies.loadSesInboundObjectVersion(data.objectKey, sourceIdentity),
    )
    await dependencies.recordCopyrightEmailParse(intake, {
      status: 'succeeded',
      fromEmail: email.fromEmail,
      ...(email.fromName ? { fromName: email.fromName } : {}),
      subject: email.subject,
      bodyText: email.bodyText,
      messageId: email.emailMessageId,
      inReplyTo: email.inReplyTo,
      replyReferences: email.references,
      attachments: (email.attachments ?? []).map(attachment => ({
        filename: attachment.filename,
        contentId: attachment.contentId,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256,
      })),
    })
  } catch (err) {
    if (!(err instanceof SesInboundTerminalError) && !isUntrustedShapeError(err)) throw err
    await dependencies.recordCopyrightEmailParse(intake, {
      status: 'failed',
      error: 'The original email could not be parsed as RFC 5322 MIME.',
    })
    return
  }
  await dependencies.enqueueCopyrightEmailIntake(intake.id)
}

async function preserveCopyrightEvidence(
  data: SesInboundProcessJobData,
  dependencies: CopyrightEmailDependencies,
): Promise<{
  intake: Awaited<ReturnType<typeof createCopyrightEmailIntake>>['intake']
  sourceIdentity: Awaited<ReturnType<typeof loadSesInboundObjectAndHash>>['sourceIdentity']
} | null> {
  return dependencies.withCopyrightEmailIntakeIdentityLock(
    data.sesMessageId,
    async (transaction, erased) => {
      const { rawMime, digest, receivedAt, sourceIdentity } =
        await dependencies.loadSesInboundObjectAndHash(data.objectKey)
      rawMime.resume()
      const raw: SesInboundRawDigest = await digest
      if (erased) {
        assertCopyrightEmailRetainedDigest(erased, raw)
        return null
      }
      const rawStorageKey = await dependencies.copySesInboundObjectToCopyrightEvidence(
        data.objectKey,
        data.sesMessageId,
        raw.sha256,
        sourceIdentity,
      )
      const { intake } = await dependencies.createCopyrightEmailIntake(
        {
          sesMessageId: data.sesMessageId,
          receivedAt,
          rawStorageKey,
          rawSha256: raw.sha256,
          rawMimeType: 'message/rfc822',
          rawByteSize: raw.byteSize,
          sesVerdicts: raw.sesVerdicts,
        },
        transaction,
      )
      return { intake, sourceIdentity }
    },
  )
}

function isUntrustedShapeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status = (error as { status?: unknown; statusCode?: unknown }).status
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return status === 422 || statusCode === 422
}
