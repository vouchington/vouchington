import { checkStagingRssBootstrap } from './staging-rss-bootstrap-command.mts'
import { close } from './setup.mts'

/* v8 ignore start -- direct CLI entry; the schema workflow runs this against a fresh staging database. */
if (import.meta.main) {
  try {
    await checkStagingRssBootstrap()
  } finally {
    await close()
  }
}
/* v8 ignore stop */
