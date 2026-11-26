import { COPYRIGHT_CASES_RUNNERS } from './run-ordered-scenarios-copyright-cases.mts'
import { MEDIA_DELIVERY_RUNNERS } from './run-ordered-scenarios-media-delivery.mts'
import { ROUND_TRIPS_RUNNERS } from './run-ordered-scenarios-round-trips.mts'
import { UPLOADS_REPORTS_RUNNERS } from './run-ordered-scenarios-uploads-reports.mts'
import { RECOVERY_RUNNERS } from './run-ordered-scenarios-recovery.mts'
import { PUBLICATION_TOPICS_RUNNERS } from './run-ordered-scenarios-publication-topics.mts'
import { EMBEDDINGS_PAYMENTS_RUNNERS } from './run-ordered-scenarios-embeddings-payments.mts'
import { RSS_NOTIFICATIONS_RUNNERS } from './run-ordered-scenarios-rss-notifications.mts'

export const LATE_RUNNERS: readonly (() => Promise<unknown>)[] = [
  ...COPYRIGHT_CASES_RUNNERS,
  ...MEDIA_DELIVERY_RUNNERS,
  ...ROUND_TRIPS_RUNNERS,
  ...UPLOADS_REPORTS_RUNNERS,
  ...RECOVERY_RUNNERS,
  ...PUBLICATION_TOPICS_RUNNERS,
  ...EMBEDDINGS_PAYMENTS_RUNNERS,
  ...RSS_NOTIFICATIONS_RUNNERS,
]
