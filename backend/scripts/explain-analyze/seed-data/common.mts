import { createHash } from 'node:crypto'

export const HOSTNAME_COUNT = 1000
export const FEED_URL_COUNT = 2500
export const ITEM_URL_POOL = 600

export const SEED_PREFIX = '019e0000'

// posts.created_at is `GENERATED ALWAYS AS (uuid_extract_timestamp(id))`, and the heavy feed
// scenarios filter posts through a rolling `time_range` window compiled against that derived
// value. Every other seed-data table shares one fixed SEED_PREFIX instant, which is fine — none
// of them are queried through a time-window filter. Posts are, so they need a real per-row spread
// of creation instants instead: one minute apart, mirroring the existing `feeds.mts` RSS-item
// seeding convention, so a realistic (non-zero, non-total) fraction lands inside any window a
// scenario filters on.
const POST_TABLE_TAG = '05'
const POST_SEED_MINUTES_APART_MS = 60_000

// Deterministic — a function of the calendar day, not Date.now() — and captured once at module
// load, not read fresh per call. seed.mts and run.mts are two SEPARATE `node` processes in CI
// (two separate workflow steps): seed.mts inserts a post's id via seedUuid(idx, '05'), and
// run.mts's scenario/support code (run-support.mts, run-scenarios/*.mts) re-derives that same
// post's id via the identical seedUuid(postIndex, '05') call to locate it, rather than
// duplicating the address as a hardcoded literal. A per-process Date.now() would give the same
// postIndex a different id in each process — network I/O and process startup separate the two
// `node` invocations in real time — so the anchor is pinned to "today" instead of "the exact
// instant this process started": any process importing this module on the same UTC day computes
// the identical anchor without the value ever crossing the process boundary. Same precedent as
// the month-anchor CRAWL_SEED_PREFIX below, at day granularity here so a post never lands more
// than ~12h off "now" — safely inside the `time_range: '1w'` window the heavy feed scenarios
// filter on.
function getCurrentDayAnchorMs(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
}

const POST_SEED_ANCHOR_MS = getCurrentDayAnchorMs()

function getCurrentMonthUuidv7Prefix(): string {
  const now = new Date()
  const inMonthAnchorMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12)
  return inMonthAnchorMs.toString(16).padStart(12, '0').slice(0, 8)
}

export const CRAWL_SEED_PREFIX = getCurrentMonthUuidv7Prefix()

export function seedUuid(index: number, tableTag = '00'): string {
  const indexHex = index.toString(16).padStart(12, '0')
  const tt = tableTag.padStart(2, '0').slice(0, 2)
  if (tt === POST_TABLE_TAG) {
    return uuidv7FromTimestamp(postSeedTimestampMs(index), indexHex)
  }
  return `${SEED_PREFIX}-${tt}00-7000-8000-${indexHex}`
}

export function postSeedTimestampMs(postIndex: number): number {
  return POST_SEED_ANCHOR_MS - postIndex * POST_SEED_MINUTES_APART_MS
}

function uuidv7FromTimestamp(timestampMs: number, indexHex: string): string {
  const tsHex = timestampMs.toString(16).padStart(12, '0').slice(-12)
  return `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-7000-8000-${indexHex}`
}

// Shared by any caller that needs a UUIDv7 pinned to a specific real-clock instant (derived from
// postSeedTimestampMs) rather than the fixed SEED_PREFIX instant — e.g. an entity-relation after
// its subject post, or a seeded comment after its parent/root post.
export function seedUuidAtTimestamp(timestampMs: number, index: number): string {
  const indexHex = index.toString(16).padStart(12, '0')
  return uuidv7FromTimestamp(timestampMs, indexHex)
}

// Election-flagged entity_relation tables (e.g. relation__post__category__topic) declare
// CHECK (id > subject_id): a vote-bearing relation must carry a UUIDv7 id timestamped after the
// post it's attached to. Fixed-instant seed ids (SEED_PREFIX) predate the real, current-clock
// timestamps posts now get from seedUuid(index, '05'), so a relation id needs to be pinned
// relative to its own subject post's timestamp rather than to another fixed instant.
export function seedRelationIdAfterPost(postIndex: number, relationIndex: number): string {
  return seedUuidAtTimestamp(postSeedTimestampMs(postIndex) + 1000, relationIndex)
}

// Some entity relations connect two fixed-SEED_PREFIX-instant rows (e.g. two topics), which still
// need an id timestamped after both subject and object to satisfy relation tables declaring both
// `CHECK (id > subject_id)` and `CHECK (id > object_id)`. Anchor to the post-seed real-clock
// instant (always later than any fixed SEED_PREFIX id) rather than adding another fixed prefix.
export function seedFreshRelationId(index: number): string {
  return seedUuidAtTimestamp(postSeedTimestampMs(0) + 2000, index)
}

// seedComments (comments-and-recently-viewed.mts) builds a 3-level comment tree under one root
// post, each level's parent_id/root_id pointing at the previous tier or the root itself. Every
// tier therefore needs a timestamp strictly after everything it references, so tiers chain 1
// second apart off the root post's own real-clock timestamp, satisfying posts'
// CHECK (parent_id IS NULL OR id > parent_id) / CHECK (root_id IS NULL OR id > root_id).
export function commentSeedTimestampMs(rootPostIndex: number, tier: 1 | 2 | 3): number {
  return postSeedTimestampMs(rootPostIndex) + tier * 1000
}

export function crawlSeedUuid(index: number, tableTag = '00'): string {
  const indexHex = index.toString(16).padStart(12, '0')
  const tt = tableTag.padStart(2, '0').slice(0, 2)
  return `${CRAWL_SEED_PREFIX}-${tt}00-7000-8000-${indexHex}`
}

export function contentHash(s: string): Buffer {
  return createHash('sha256').update(s).digest()
}
