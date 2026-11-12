import { prepareAiUsageMonth } from '@data-stores/psql/ai-usage-monthly-partition'
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { getTestAiUsageReservationMonths } from './ai-usage-date-grid.mts'

// CI prepares these fixture children before dumping the baseline, never in concurrent tests.
try {
  for (const month of getTestAiUsageReservationMonths(new Date())) {
    // At most four fixture months, prepared serially before workers start.
    await prepareAiUsageMonth(month)
  }
} finally {
  await shutdownDataStoresForOneOffCommand()
}
