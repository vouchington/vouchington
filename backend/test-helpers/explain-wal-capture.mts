import { explainAnalyze, write } from '@data-stores/psql'
import { coldWalPageAddress, selectSealedUsers, type LocatedUser } from './explain-wal-pages.mts'

// Fullness is the page hole, not a live-row count. A dirty users page can be
// full with fewer than 30 rows when other tuples are wider or dead.
// Wider rows avoid narrow reusable holes; physical validation still decides.
const COLD_WAL_FILL_ROWS = 600
const COLD_WAL_FILL_LIMIT = 2401
const COLD_WAL_MIN_PAGES = 3
const USERS_PAGE_BYTES = 8192

const pageNumberSql = String.raw`substring(ctid::text FROM $re$^\((\d+),$re$)::integer`
const lineNumberSql = String.raw`substring(ctid::text FROM $re$,(\d+)\)$re$)::integer`

async function insertColdWalUsers(count: number, padding: number | null): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* insertColdWalUsers */
     INSERT INTO users (username, verified_full_name)
     SELECT NULL::text, repeat('x', $2::integer)
     FROM generate_series(1, $1::integer)
     RETURNING id::text AS id`,
    [count, padding],
  )
  return rows.map(row => row.id)
}

async function locateColdWalUsers(ids: readonly string[]): Promise<LocatedUser[]> {
  const { rows } = await write<LocatedUser>(
    `/* locateColdWalUsers */
     SELECT id::text AS id, ${pageNumberSql} AS page, ${lineNumberSql} AS line
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [ids],
  )
  return rows
}

async function readUserPageImages(pages: readonly number[]) {
  // This test role needs pg_read_server_files (or superuser) in addition to
  // CHECKPOINT privileges. Paths are server-relative, never local client paths.
  const settings = await write<{
    path: string
    blockBytes: number
    segmentBytes: number
    minimumTupleBytes: number
  }>(
    `/* coldWalHeapSettings */ SELECT pg_relation_filepath('users') AS path,
      current_setting('block_size')::integer AS "blockBytes",
      pg_size_bytes(current_setting('segment_size'))::float8 AS "segmentBytes",
      (23 + (SELECT COALESCE(sum(attlen), 0) FROM pg_attribute
        WHERE attrelid = 'users'::regclass AND attnum > 0
          AND attnotnull AND attlen > 0 AND NOT attisdropped AND attgenerated <> 'v'))::integer AS "minimumTupleBytes"`,
  )
  const setting = settings.rows[0]!
  if (setting.blockBytes !== USERS_PAGE_BYTES)
    throw new Error('Cold WAL capture requires 8 KiB heap pages')
  const addresses = pages.map(page => coldWalPageAddress(setting.path, page, setting.segmentBytes))
  const { rows } = await write<{ page: number; image: Buffer }>(
    `/* readUserPageImages */
     SELECT page, pg_read_binary_file(path, offset_bytes, ${USERS_PAGE_BYTES}) AS image
     FROM unnest($1::integer[], $2::text[], $3::bigint[]) AS input(page, path, offset_bytes)`,
    [pages, addresses.map(address => address.path), addresses.map(address => address.offset)],
  )
  return {
    images: new Map(rows.map(row => [row.page, row.image])),
    minimumTupleBytes: setting.minimumTupleBytes,
  }
}

async function sealedColdWalUsers(ids: readonly string[]): Promise<string[]> {
  // Locating can prune old versions from users' insert triggers. Flush those
  // changes before reading the heap file; capture checkpoints again before UPDATE.
  const located = await locateColdWalUsers(ids)
  await write('/* sealedColdWalUsers */ CHECKPOINT')
  const pages = [...new Set(located.map(row => row.page))]
  if (pages.length === 0) return []
  const { images, minimumTupleBytes } = await readUserPageImages(pages)
  return selectSealedUsers(located, images, minimumTupleBytes)
}

async function reserveColdWalUsers(ids: string[]): Promise<string[]> {
  ids.push(...(await insertColdWalUsers(1, null)))
  // Four nearly-2-KiB rows seal a page instead of reusing narrow dirty holes.
  // Measure the owned seed so padding follows the current users row shape.
  const { rows } = await write<{ padding: number }>(
    `/* reserveColdWalUsers */ SELECT 2016 - pg_column_size(u) AS padding
     FROM users AS u WHERE id = $1::uuid`,
    [ids[0]],
  )
  const padding = rows[0]!.padding
  if (padding <= 0) throw new Error('Cold WAL users row exceeds inline page target')
  let chosen: string[] = []
  while (ids.length < COLD_WAL_FILL_LIMIT && chosen.length < COLD_WAL_MIN_PAGES) {
    ids.push(...(await insertColdWalUsers(COLD_WAL_FILL_ROWS, padding)))
    chosen = await sealedColdWalUsers(ids)
  }
  if (chosen.length < COLD_WAL_MIN_PAGES) {
    throw new Error(
      `Cold WAL capture reserved ${chosen.length} sealed users pages; need ${COLD_WAL_MIN_PAGES}`,
    )
  }
  return chosen
}

async function deleteColdWalUsers(ids: readonly string[]) {
  for (let offset = 0; offset < ids.length; offset += 250) {
    await write(`/* deleteColdWalUsers */ DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      ids.slice(offset, offset + 250),
    ])
  }
}

export async function createExplainWalCaptureFixture(scenarioId: string) {
  const ids: string[] = []
  try {
    // Every occupied slot on each sealed page belongs to this fixture. Foreign
    // updates/deletes cannot warm these pages. Autovacuum visibility changes can
    // still consume an FPI when checksums or wal_log_hints are enabled; this is
    // a shared database fixture, not an exclusion lock against maintenance.
    const userIds = await reserveColdWalUsers(ids)
    const input = {
      name: 'wal-condition-test',
      text: `/* walConditionTest */ UPDATE users SET markdown = $2
        WHERE id = ANY($1::uuid[]) AND current_setting('application_name') = $3 RETURNING id`,
      values: [userIds, 'temporary change', 'wal-condition-test'],
      scenarioId,
      captureIndex: 0,
      localSettings: { application_name: 'wal-condition-test' },
    }
    return {
      input,
      rowCount: userIds.length,
      ownedPageCount: userIds.length,
      async captureCold() {
        await write('/* walConditionTestCheckpoint */ CHECKPOINT')
        return explainAnalyze(input.name, input.text, input.values, {
          localSettings: input.localSettings,
          planCacheMode: 'force_custom_plan',
        })
      },
      async readMarkdown() {
        const { rows } = await write<{ markdown: string }>(
          '/* walConditionTestRead */ SELECT markdown FROM users WHERE id = $1::uuid',
          [userIds[0]],
        )
        return rows[0]?.markdown
      },
      async cleanup() {
        await deleteColdWalUsers(ids)
      },
    }
  } catch (err) {
    await deleteColdWalUsers(ids)
    throw err
  }
}
