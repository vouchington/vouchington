// ECS migration task entry used by the infrastructure-owned deployment workflow. Lives here
// so the deployed image exposes it at the package root, where --experimental-strip-types
// works and the workspace graph (not a hand-maintained path) provides @data-stores/psql.
import { runAllMigrations } from '@data-stores/psql/migrate'
import { finalizeLegacySentimentProductionPromotion } from '@services/elections-votes/finalize-legacy-sentiment'
import { enqueueLegacySentimentEntityRefreshes } from '@services/elections-votes/migrate-legacy-sentiment-refresh'

/* c8 ignore next -- process entrypoint exercised by the infrastructure deployment workflow. */
if (process.argv.includes('--finalize-legacy-sentiment')) {
  await finalizeLegacySentimentProductionPromotion()
} else {
  await runAllMigrations({ afterCommit: enqueueLegacySentimentEntityRefreshes })
}
