import onError from '@modules/on-error'
import type { BackgroundResponseLease } from '@modules/openai-utils/create-response'

export const BACKGROUND_RESPONSE_HEARTBEAT_INTERVAL_MS = 60_000
export const BACKGROUND_RESPONSE_RENEWAL_RETRY_MS = 5_000
export const BACKGROUND_RESPONSE_LEASE_DURATION_MS = 3 * 60_000

export interface BackgroundResponseLeaseIdentity {
  responseId: string
  leaseToken: string
  createdAt: Date
}

type LeaseControllerDependencies = {
  renew: () => Promise<boolean>
  reportError?: (error: Error) => void
}

export type OwnedBackgroundResponseLease = BackgroundResponseLease &
  Readonly<BackgroundResponseLeaseIdentity>

class LeaseController implements OwnedBackgroundResponseLease {
  readonly responseId: string
  readonly leaseToken: string
  readonly createdAt: Date
  private timer: NodeJS.Timeout | undefined
  private inFlight: Promise<void> | undefined
  private stopped = false
  private degraded = false
  private readonly dependencies: Required<LeaseControllerDependencies>

  constructor(
    identity: BackgroundResponseLeaseIdentity,
    dependencies: Required<LeaseControllerDependencies>,
  ) {
    this.responseId = identity.responseId
    this.leaseToken = identity.leaseToken
    this.createdAt = identity.createdAt
    this.dependencies = dependencies
    this.schedule(BACKGROUND_RESPONSE_HEARTBEAT_INTERVAL_MS)
  }

  async stopAndSettle(): Promise<void> {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    await this.inFlight
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (this.stopped) return
      const renewal = this.runRenewal()
      this.inFlight = renewal
      void renewal.finally(() => {
        if (this.inFlight === renewal) this.inFlight = undefined
      })
    }, delayMs)
    this.timer.unref()
  }

  private async runRenewal(): Promise<void> {
    try {
      const renewed = await this.dependencies.renew()
      if (!renewed) {
        this.stopped = true
        this.report(
          new Error(`Background OpenAI response lease lost ownership: ${this.responseId}`),
        )
        return
      }
      this.degraded = false
      this.schedule(BACKGROUND_RESPONSE_HEARTBEAT_INTERVAL_MS)
    } catch (cause) {
      if (!this.degraded) {
        this.degraded = true
        this.report(
          new Error(`Background OpenAI response lease renewal failed: ${this.responseId}`, {
            cause,
          }),
        )
      }
      this.schedule(BACKGROUND_RESPONSE_RENEWAL_RETRY_MS)
    }
  }

  private report(error: Error): void {
    try {
      this.dependencies.reportError(error)
    } catch {
      // Error reporting must not alter lease ownership or mask the response stream's result.
    }
  }
}

export function createBackgroundResponseLeaseController(
  identity: BackgroundResponseLeaseIdentity,
  dependencies: LeaseControllerDependencies,
): OwnedBackgroundResponseLease {
  return new LeaseController(identity, {
    renew: dependencies.renew,
    reportError: dependencies.reportError ?? onError,
  })
}
