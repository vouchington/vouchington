import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const postSnapshotSource = readFileSync(
  new URL('./reconcile-post-snapshot.mts', import.meta.url),
  'utf8',
)
const rssSnapshotSource = readFileSync(
  new URL('./reconcile-rss-feed-item.mts', import.meta.url),
  'utf8',
)

describe('notification reconciliation primary reads', () => {
  it('loads post notification eligibility snapshots from the write pool', () => {
    expect(postSnapshotSource).toContain("import { write } from '@data-stores/psql'")
    expect(postSnapshotSource).toContain('const { rows } = await write(query)')
    expect(postSnapshotSource).not.toContain('await read(query)')
  })

  it('loads RSS notification eligibility snapshots from the write pool', () => {
    expect(rssSnapshotSource).toContain(
      "import { type PoolClient, write } from '@data-stores/psql'",
    )
    expect(rssSnapshotSource).toContain('const { rows } = await write(query)')
    expect(rssSnapshotSource).not.toContain('await read(query)')
  })
})
