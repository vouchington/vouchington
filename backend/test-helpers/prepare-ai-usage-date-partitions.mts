import { prepareAiUsageMonth } from '@data-stores/psql/ai-usage-monthly-partition'
import { close } from '@data-stores/psql/setup'
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { getTestAiUsageReservationMonths } from './ai-usage-date-grid.mts'

// Local setup and CI prepare fixture children before workers, never in concurrent tests.
try {
  for (const month of getTestAiUsageReservationMonths(new Date())) {
    // Both bounded reservation grids are prepared serially before workers start.
    await prepareAiUsageMonth(month)
  }
} finally {
  await shutdownDataStoresForOneOffCommand({ onGracefulShutdownPSQL: close })
}
