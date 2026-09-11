import onError from '@modules/on-error'
import { discardRejectedContributionAdmission } from './admission-reservations.mts'

export async function cleanupRejectedContributionAdmission(
  reservationId: string,
  leaseId: string,
): Promise<void> {
  await attemptCleanup(() => discardRejectedContributionAdmission(reservationId, leaseId))
}

async function attemptCleanup(cleanup: () => Promise<void>): Promise<void> {
  try {
    await cleanup()
  } catch (error) {
    onError(
      error instanceof Error
        ? error
        : new Error('Contribution admission cleanup failed', { cause: error }),
    )
  }
}
