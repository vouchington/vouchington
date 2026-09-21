import type {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '@services/copyright-notices'
import type { enqueueCopyrightEmailIntakeAndWait } from '@queues/ai-agents/enqueues/copyright-email-intake'
import type { SesInboundProcessJobData } from '@ts-shared/ses-inbound-contract'
import { SesInboundTerminalError, type parseSesInboundMime } from './mime.mts'
import type {
  copySesInboundObjectToCopyrightEvidence,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
} from './s3.mts'

export type CopyrightEmailDependencies = {
  copySesInboundObjectToCopyrightEvidence: typeof copySesInboundObjectToCopyrightEvidence
  createCopyrightEmailIntake: typeof createCopyrightEmailIntake
  enqueueCopyrightEmailIntakeAndWait: typeof enqueueCopyrightEmailIntakeAndWait
  loadSesInboundObjectAndHash: typeof loadSesInboundObjectAndHash
  loadSesInboundObjectVersion: typeof loadSesInboundObjectVersion
  parseSesInboundMime: typeof parseSesInboundMime
  recordCopyrightEmailParse: typeof recordCopyrightEmailParse
}

export async function processCopyrightInboundEmail(
  data: SesInboundProcessJobData,
  dependencies: CopyrightEmailDependencies,
): Promise<void> {
  const { intake, sourceIdentity } = await preserveCopyrightEvidence(data, dependencies)
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
      replyReferences: email.replyRefs,
      attachments: (email.attachments ?? []).map(attachment => ({
        filename: attachment.filename,
        contentId: attachment.contentId,
        mimeType: attachment.mimeType,
        byteSize: attachment.byteSize,
        sha256: attachment.sha256,
      })),
    })
  } catch (error) {
    if (!(error instanceof SesInboundTerminalError) && !isUntrustedShapeError(error)) throw error
    await dependencies.recordCopyrightEmailParse(intake, {
      status: 'failed',
      error: 'The original email could not be parsed as RFC 5322 MIME.',
    })
    return
  }
  await dependencies.enqueueCopyrightEmailIntakeAndWait(intake.id)
}

async function preserveCopyrightEvidence(
  data: SesInboundProcessJobData,
  dependencies: CopyrightEmailDependencies,
): Promise<{
  intake: Awaited<ReturnType<typeof createCopyrightEmailIntake>>['intake']
  sourceIdentity: Awaited<ReturnType<typeof loadSesInboundObjectAndHash>>['sourceIdentity']
}> {
  const { rawMime, digest, receivedAt, sourceIdentity } =
    await dependencies.loadSesInboundObjectAndHash(data.objectKey)
  rawMime.resume()
  const { raw, rawStorageKey } = await hashAndCopyCopyrightEvidence(
    digest,
    data,
    sourceIdentity,
    dependencies,
  )
  const { intake } = await dependencies.createCopyrightEmailIntake({
    sesMessageId: data.sesMessageId,
    receivedAt,
    rawStorageKey,
    rawSha256: raw.sha256,
    rawMimeType: 'message/rfc822',
    rawByteSize: raw.byteSize,
  })
  return { intake, sourceIdentity }
}

async function hashAndCopyCopyrightEvidence(
  digest: Promise<{ sha256: Buffer; byteSize: number }>,
  data: SesInboundProcessJobData,
  sourceIdentity: Awaited<ReturnType<typeof loadSesInboundObjectAndHash>>['sourceIdentity'],
  dependencies: CopyrightEmailDependencies,
) {
  const raw = await digest
  const rawStorageKey = await dependencies.copySesInboundObjectToCopyrightEvidence(
    data.objectKey,
    data.sesMessageId,
    raw.sha256,
    sourceIdentity,
  )
  return { raw, rawStorageKey }
}

function isUntrustedShapeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const status = (error as { status?: unknown; statusCode?: unknown }).status
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return status === 422 || statusCode === 422
}
