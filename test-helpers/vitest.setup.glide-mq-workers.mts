// Suppress WARN-level messages from Glide's Rust logger (e.g. "item exists" from BF.RESERVE)
import { Logger } from '@valkey/valkey-glide'

Logger.setLoggerConfig('error')

// Start a subset of queue workers in-process for backend tests.
// These are internal/data-only workers needed for side effects that many tests expect.
// Do not import post-publication, cache-purge, or crawl-embeds here: their processors run real
// side effects (reconciliation, cache purge, embed crawling) on every job enqueued anywhere in this
// isolate:false fork, not just in the file that imports them. worker-io definition identity tests
// close those singletons after loading them (#10984); the post-publication enqueue test attaches and
// closes its own stub worker per-test via `createWorker`/`closeAndUnregisterGlideMQInstance` (#11013).
// See docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files.
import '@workers/bloom-filters/workers'
import '@workers/topic-ratings/workers'
import '@workers/elections/workers'
import '@workers/entity-listeners/workers'
import '@workers/entity-metrics-cache-refresh/workers'
