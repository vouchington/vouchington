import { explainAnalyze, write } from '@data-stores/psql'

// Fullness is the page hole, not a live-row count. A dirty users page can be
// full with fewer than 30 rows when other tuples are wider or dead.
const COLD_WAL_FILL_ROWS = 150
const COLD_WAL_FILL_LIMIT = 600
const COLD_WAL_MIN_PAGES = 3
const USERS_PAGE_BYTES = 8192
const PAGE_HEADER_BYTES = 24
const LINE_POINTER_BYTES = 4
const LINE_POINTER_NORMAL = 1

const pageNumberSql = String.raw`substring(ctid::text FROM $re$^\((\d+),$re$)::integer`
const lineNumberSql = String.raw`substring(ctid::text FROM $re$,(\d+)\)$re$)::integer`

type LocatedUser = { id: string; page: number; line: number }

function pageBytes(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') {
    const hex = value.startsWith('\\x') ? value.slice(2) : value
    return Buffer.from(hex, 'hex')
  }
  throw new Error('Cold WAL page image was not bytea')
}

function linePointerLength(image: Buffer, line: number): number | undefined {
  const offset = PAGE_HEADER_BYTES + (line - 1) * LINE_POINTER_BYTES
  if (line < 1 || offset + LINE_POINTER_BYTES > image.length) return undefined
  const raw = image.readUInt32LE(offset)
  if (((raw >>> 15) & 0x3) !== LINE_POINTER_NORMAL) return undefined
  return (raw >>> 17) & 0x7fff
}

function pageHole(image: Buffer): number | undefined {
  if (image.length < 16) return undefined
  const lower = image.readUInt16LE(12)
  const upper = image.readUInt16LE(14)
  if (upper < lower) return undefined
  return upper - lower
}

// A page is sealed when another minimum users tuple cannot fit, including its
// new line pointer. One owned row on that page is enough to update.
function selectSealedUsers(
  rows: readonly LocatedUser[],
  images: ReadonlyMap<number, Buffer>,
): string[] {
  const lengths: number[] = []
  for (const row of rows) {
    const image = images.get(row.page)
    if (!image) continue
    const length = linePointerLength(image, row.line)
    if (length !== undefined) lengths.push(length)
  }
  const minimum = lengths.length === 0 ? undefined : Math.min(...lengths)
  if (minimum === undefined) return []
  const sealedBelow = minimum + LINE_POINTER_BYTES
  const chosen = new Map<number, string>()
  for (const row of rows) {
    if (chosen.has(row.page)) continue
    const image = images.get(row.page)
    if (!image) continue
    const hole = pageHole(image)
    if (hole === undefined || hole >= sealedBelow) continue
    if (linePointerLength(image, row.line) === undefined) continue
    chosen.set(row.page, row.id)
  }
  return [...chosen.values()]
}

async function insertColdWalUsers(): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* insertColdWalUsers */
     INSERT INTO users (username)
     SELECT NULL::text
     FROM generate_series(1, $1::integer)
     RETURNING id::text AS id`,
    [COLD_WAL_FILL_ROWS],
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

async function readUserPageImages(pages: readonly number[]): Promise<Map<number, Buffer>> {
  const { rows } = await write<{ page: number | string; image: unknown }>(
    `/* readUserPageImages */
     SELECT page,
            pg_read_binary_file(
              pg_relation_filepath('users'),
              page::bigint * ${USERS_PAGE_BYTES},
              ${USERS_PAGE_BYTES}
            ) AS image
     FROM unnest($1::integer[]) AS page`,
    [pages],
  )
  return new Map(rows.map(row => [Number(row.page), pageBytes(row.image)]))
}

async function sealedColdWalUsers(ids: readonly string[]): Promise<string[]> {
  // pg_read_binary_file reads the heap file. Shared buffers stay stale on disk
  // until a checkpoint, and the capture checkpoint still runs before the update.
  await write('/* sealedColdWalUsers */ CHECKPOINT')
  const located = await locateColdWalUsers(ids)
  const pages = [...new Set(located.map(row => row.page))]
  if (pages.length === 0) return []
  return selectSealedUsers(located, await readUserPageImages(pages))
}

async function reserveColdWalUsers(ids: string[]): Promise<string[]> {
  let chosen: string[] = []
  while (ids.length < COLD_WAL_FILL_LIMIT && chosen.length < COLD_WAL_MIN_PAGES) {
    ids.push(...(await insertColdWalUsers()))
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
  if (ids.length === 0) return
  await write(`/* deleteColdWalUsers */ DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids])
}

export async function createExplainWalCaptureFixture(scenarioId: string) {
  const ids: string[] = []
  try {
    // Updating one owned row on several sealed pages keeps a cold full-page
    // image when a concurrent insert cannot land on those pages.
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
