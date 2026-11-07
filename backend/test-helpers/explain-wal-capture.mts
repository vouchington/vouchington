import { explainAnalyze, write } from '@data-stores/psql'

// A users heap page holds 30 live minimum rows. The tip still accepts inserts.
const COLD_WAL_FULL_PAGE_ROWS = 30
const COLD_WAL_FILL_ROWS = 150
const COLD_WAL_MIN_PAGES = 3

const pageNumberSql = String.raw`substring(ctid::text FROM $re$^\((\d+),$re$)::integer`

type PageRow = { id: string; page: number }

function selectColdWalUsers(rows: readonly PageRow[], owned: ReadonlySet<string>): string[] {
  const byPage = new Map<number, { ids: string[]; total: number }>()
  for (const row of rows) {
    const page = row.page
    const bucket = byPage.get(page) ?? { ids: [], total: 0 }
    bucket.total += 1
    if (owned.has(row.id)) bucket.ids.push(row.id)
    byPage.set(page, bucket)
  }
  const pageNumbers = [...byPage.keys()]
  if (pageNumbers.length === 0) return []
  const tip = Math.max(...pageNumbers)
  const chosen: string[] = []
  for (const [page, bucket] of byPage) {
    const id = bucket.ids[0]
    if (page === tip || bucket.total < COLD_WAL_FULL_PAGE_ROWS || id === undefined) continue
    chosen.push(id)
  }
  return chosen
}

async function insertColdWalUsers(): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* walConditionTestReserve */
     INSERT INTO users (username)
     SELECT NULL::text
     FROM generate_series(1, $1::integer)
     RETURNING id::text AS id`,
    [COLD_WAL_FILL_ROWS],
  )
  return rows.map(row => row.id)
}

async function readColdWalPages(ids: readonly string[]): Promise<PageRow[]> {
  const located = await write<PageRow>(
    `/* walConditionTestLocate */
     SELECT id::text AS id, ${pageNumberSql} AS page
     FROM users
     WHERE id = ANY($1::uuid[])`,
    [ids],
  )
  const pages = [...new Set(located.rows.map(row => row.page))]
  const { rows } = await write<PageRow>(
    `/* walConditionTestPages */
     SELECT id::text AS id, ${pageNumberSql} AS page
     FROM users
     WHERE ${pageNumberSql} = ANY($1::integer[])`,
    [pages],
  )
  return rows
}

async function reserveColdWalUsers(ids: string[]): Promise<string[]> {
  const inserted = await insertColdWalUsers()
  ids.push(...inserted)
  const chosen = selectColdWalUsers(await readColdWalPages(inserted), new Set(inserted))
  if (chosen.length < COLD_WAL_MIN_PAGES) {
    throw new Error(
      `Cold WAL capture reserved ${chosen.length} full users pages; need ${COLD_WAL_MIN_PAGES}`,
    )
  }
  return chosen
}

async function deleteColdWalUsers(ids: readonly string[]) {
  if (ids.length === 0) return
  await write(`/* walConditionTestCleanup */ DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids])
}

export async function createExplainWalCaptureFixture(scenarioId: string) {
  const ids: string[] = []
  try {
    // One newly inserted users row shares the heap page that every other test is filling.
    // A checkpoint then an update of that row records no full-page image when another
    // insert lands on the page first. Updating one owned row on several already-full
    // pages keeps at least one cold heap page: later inserts do not fit there.
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
