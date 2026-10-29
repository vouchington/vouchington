import { lockCopyrightNoticeLifetime, type CopyrightNoticeLifetime } from './notice-lifetime.mts'
import type { TransactionQuery } from '@data-stores/psql'
import {
  lockCopyrightReplayAdmission,
  type CopyrightReplayInput,
} from './replay-admission-locks.mts'
import { requireCopyrightReplayKeyVersions } from './replay-key-versions.mts'
import {
  copyrightReplayDigestCandidates,
  copyrightReplayKeyMetadata,
} from './replay-identity-hmac.mts'

/** One logical admission owns its candidate locks and key coverage for exactly one transaction. */
export class CopyrightReplayAdmission {
  readonly query: TransactionQuery
  readonly input: Readonly<CopyrightReplayInput>
  private readonly capturedSlots: Awaited<ReturnType<typeof lockCopyrightReplayAdmission>>
  get slots(): ReadonlyArray<
    Readonly<Awaited<ReturnType<typeof lockCopyrightReplayAdmission>>[number]>
  > {
    return this.capturedSlots.map(slot => ({
      ...slot,
      digest: Buffer.from(slot.digest),
      requester: Buffer.from(slot.requester),
      request: Buffer.from(slot.request),
    }))
  }
  private keyVersions: Promise<void> | undefined
  private readonly versionChecks: ReturnType<typeof copyrightReplayKeyMetadata>
  private readonly noticeLifetime?: CopyrightNoticeLifetime

  private constructor(
    query: TransactionQuery,
    input: CopyrightReplayInput,
    slots: Awaited<ReturnType<typeof lockCopyrightReplayAdmission>>,
    versionChecks: ReturnType<typeof copyrightReplayKeyMetadata>,
    noticeLifetime?: CopyrightNoticeLifetime,
  ) {
    this.query = query
    this.input = Object.freeze({ ...input })
    this.capturedSlots = slots
    this.versionChecks = versionChecks
    this.noticeLifetime = noticeLifetime
  }

  static async open(
    query: TransactionQuery,
    input: CopyrightReplayInput,
    noticeLifetime?: CopyrightNoticeLifetime,
  ) {
    noticeLifetime?.assertTransaction(query)
    const capturedInput = Object.freeze({ ...input })
    const versionChecks = copyrightReplayKeyMetadata()
    return new CopyrightReplayAdmission(
      query,
      capturedInput,
      await lockCopyrightReplayAdmission(query, capturedInput),
      versionChecks,
      noticeLifetime,
    )
  }

  /** An acknowledgment is stored for its actual FK requester, even when staff performed it. */
  forOriginalRequester(requester: string): CopyrightReplayAdmission {
    const current = new Map(
      copyrightReplayKeyMetadata().map(key => [key.id, key.materialVerificationHmac]),
    )
    if (this.versionChecks.some(key => !current.get(key.id)?.equals(key.materialVerificationHmac)))
      throw new Error('Copyright replay ring changed during admission')
    const requesters = new Map(
      copyrightReplayDigestCandidates('requester', requester).map(slot => [
        slot.keyId,
        slot.digest,
      ]),
    )
    const slots = this.capturedSlots.map(slot => {
      const requesterHmac = requesters.get(slot.keyId)
      if (!requesterHmac)
        throw new Error('Copyright replay requires a missing requester key version')
      return { ...slot, requester: requesterHmac }
    })
    const original = new CopyrightReplayAdmission(
      this.query,
      { ...this.input, requester },
      slots,
      this.versionChecks,
      this.noticeLifetime,
    )
    original.keyVersions = this.keyVersions
    return original
  }

  async lockNoticeLifetime(noticeId: string): Promise<void> {
    if (this.noticeLifetime?.covers(this.query, noticeId)) return
    await lockCopyrightNoticeLifetime(this.query, noticeId)
  }

  /** Called only after the applicable notice/group locks; failures remain failures in this scope. */
  requireKeyVersions(): Promise<void> {
    this.keyVersions ??= requireCopyrightReplayKeyVersions(this.query)
    return this.keyVersions
  }
}
