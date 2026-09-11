import { reconcileIntegrityExactRead } from './integrity-reconciliation'

export type IntegrityFlagMutationKind = 'penalty' | 'resolve'
export type IntegrityFlagReconciliationKind = IntegrityFlagMutationKind | 'penalty-confirmation'

export interface IntegrityFlagMutationControllerOptions<F> {
  applyConfirmedFlag: (flag: F) => void
  canRetryPenaltyAfterReconciliation?: (flag: F, flagId: string) => boolean | Promise<boolean>
  getFlag: (flagId: string) => Promise<{ flag: F }>
  uncertainMessage: string
}

export interface IntegrityFlagMutationControllerState {
  actionErrors: Record<string, string>
  actionLoading: Record<string, boolean>
  reconciliationRequired: Record<string, boolean>
}

export class IntegrityFlagMutationController<F> {
  private readonly mutationLocks = new Set<string>()
  private readonly reconciliationKinds = new Map<string, IntegrityFlagReconciliationKind>()
  private readonly reconciliationPromises = new Map<string, Promise<boolean>>()
  private readonly nonRepeatablePenaltyFlagIds = new Set<string>()
  private actionErrors: Record<string, string> = {}
  private actionLoading: Record<string, boolean> = {}
  private reconciliationRequired: Record<string, boolean> = {}

  constructor(private options: IntegrityFlagMutationControllerOptions<F>) {}

  updateOptions(options: IntegrityFlagMutationControllerOptions<F>) {
    this.options = options
  }

  get state(): IntegrityFlagMutationControllerState {
    return {
      actionErrors: this.actionErrors,
      actionLoading: this.actionLoading,
      reconciliationRequired: this.reconciliationRequired,
    }
  }

  canAcquire(flagId: string, kind: IntegrityFlagMutationKind): boolean {
    return !(
      this.mutationLocks.has(flagId) ||
      (kind === 'penalty' && this.nonRepeatablePenaltyFlagIds.has(flagId))
    )
  }

  acquire(flagId: string, kind: IntegrityFlagMutationKind): boolean {
    if (!this.canAcquire(flagId, kind)) return false
    this.mutationLocks.add(flagId)
    this.actionLoading = { ...this.actionLoading, [flagId]: true }
    this.actionErrors = { ...this.actionErrors, [flagId]: '' }
    return true
  }

  preventPenaltyRetry(flagId: string) {
    this.nonRepeatablePenaltyFlagIds.add(flagId)
  }

  release(flagId: string) {
    this.mutationLocks.delete(flagId)
    this.actionLoading = { ...this.actionLoading, [flagId]: false }
  }

  fail(flagId: string, message: string) {
    this.actionErrors = { ...this.actionErrors, [flagId]: message }
    this.release(flagId)
  }

  requireReconciliation(flagId: string, kind: IntegrityFlagReconciliationKind) {
    this.reconciliationKinds.set(flagId, kind)
    this.reconciliationRequired = { ...this.reconciliationRequired, [flagId]: true }
    this.actionErrors = { ...this.actionErrors, [flagId]: this.options.uncertainMessage }
  }

  reconcile(flagId: string, kind: IntegrityFlagReconciliationKind): Promise<boolean> {
    const inFlight = this.reconciliationPromises.get(flagId)
    if (inFlight) return inFlight

    const reconciliation = this.reconcileOnce(flagId, kind)
    this.reconciliationPromises.set(flagId, reconciliation)
    void reconciliation.then(
      () => this.clearReconciliationPromise(flagId, reconciliation),
      () => this.clearReconciliationPromise(flagId, reconciliation),
    )
    return reconciliation
  }

  private clearReconciliationPromise(flagId: string, reconciliation: Promise<boolean>) {
    if (this.reconciliationPromises.get(flagId) === reconciliation)
      this.reconciliationPromises.delete(flagId)
  }

  private async reconcileOnce(
    flagId: string,
    kind: IntegrityFlagReconciliationKind,
  ): Promise<boolean> {
    this.requireReconciliation(flagId, kind)
    const outcome = await reconcileIntegrityExactRead({
      getExactState: () => this.options.getFlag(flagId),
      mutationConfirmed: () => true,
    })
    if (outcome.status === 'unknown' || !outcome.state) {
      this.actionErrors = { ...this.actionErrors, [flagId]: this.options.uncertainMessage }
      return false
    }
    const { flag } = outcome.state
    this.options.applyConfirmedFlag(flag)
    if (kind === 'penalty') {
      try {
        if ((await this.options.canRetryPenaltyAfterReconciliation?.(flag, flagId)) === true)
          this.nonRepeatablePenaltyFlagIds.delete(flagId)
      } catch {
        this.actionErrors = { ...this.actionErrors, [flagId]: this.options.uncertainMessage }
        return false
      }
    }
    this.reconciliationKinds.delete(flagId)
    this.reconciliationRequired = { ...this.reconciliationRequired, [flagId]: false }
    this.actionErrors = { ...this.actionErrors, [flagId]: '' }
    this.release(flagId)
    return true
  }

  async retryReconciliation(flagId: string) {
    const kind = this.reconciliationKinds.get(flagId)
    if (kind) await this.reconcile(flagId, kind)
  }
}
