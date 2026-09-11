// Side-effect registration: see backend/entrypoints/api/index.mts for why this import exists —
// vote-backed relation writes below (topic tagging) depend on it.
import '@backend/service-registrations'
import { seedTopicsFromCsvs } from '@services/admin-imports/seed-csvs'
import { seedArticles } from './articles.mts'

// Invariant data (system users, blacklist sources, communities, jong admin) is now
// seeded by config-driven generators that run on every `db:migrate`, including in
// production. Only sample/dev data belongs here.
export default async function main() {
  await seedTopicsFromCsvs()
  await seedArticles()
}
