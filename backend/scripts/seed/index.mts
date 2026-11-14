// Side-effect registration: see backend/entrypoints/api/index.mts for why this import exists —
// vote-backed relation writes below (topic tagging) depend on it.
import '@backend/service-registrations'
import { refreshMaterializedView } from '@data-stores/psql/migration-runner/refresh-materialized-view'
import { readSeedCsvRows, seedTopicsFromCsvs } from '@services/admin-imports/seed-csvs'
import { seedArticles } from './articles.mts'
import { seedCopyright } from './copyright.mts'

// Invariant data (system users, blacklist sources, communities, jong admin) is now
// seeded by config-driven generators that run on every `db:migrate`, including in
// production. Only sample/dev data belongs here.
export default async function main() {
  await seedTopicsFromCsvs({ rows: readSeedCsvRows() })
  await seedArticles()
  await seedCopyright()
  // Trending topics are served from a view that the scheduled refresh normally fills.
  await refreshMaterializedView('mv_trending_topics')
}
