// Suppress WARN-level messages from Glide's Rust logger (e.g. "item exists" from BF.RESERVE)
import { Logger } from '@valkey/valkey-glide'
import { startSharedBackgroundWorker } from './shared-background-worker.mts'

Logger.setLoggerConfig('error')

// Start a subset of queue workers in-process for backend tests.
// These are internal/data-only workers needed for side effects that many tests expect.
// Never serve post-publication, cache-purge, or crawl-embeds from here: their handlers run real
// side effects (reconciliation, cache purge, embed crawling) on every job enqueued anywhere in this
// isolate:false fork, not just in the file that imports them. post-publication and cache-purge are
// domains of the shared `background` queue, as are rss-feeds, urls-domains-blacklist, and sitemaps
// (real network and storage work): never serve them from a global worker; a test that needs a
// domain's jobs drained builds its own `createBackgroundWorker({ handlers, domains: [...] })` (with
// a stub handler unless it wants the real work) and closes it with
// `closeAndUnregisterGlideMQInstance` (#11013).
// See docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files.
import '@workers/bloom-filters/workers'

// ONE `background` worker per fork, serving only these domains; a job of any other domain parks
// instead of running. vote-aggregation and entity-listeners are the data-only side-effect domains
// many tests expect. Helpers that watch the worker's events import `./shared-background-worker.mts`
// so they observe this same instance.
startSharedBackgroundWorker(['vote-aggregation', 'entity-listeners'])
