import { describe, expect, it } from 'vitest'
import { read } from '../index.mts'

type TableColumn = {
  column_name: string
  is_generated: string
  column_default: string | null
}

const topicExtensionTables = [
  'topics__cards',
  'topics__referral_programs',
  'topics__rewards_program_statuses',
  'topics__rewards_programs',
  'topics__spending_categories',
]

describe('extension table key columns', () => {
  it('post_review_topic_ratings uses post_id and created_at defaults to row creation time', async () => {
    const columns = await getTableColumns('post_review_topic_ratings')
    const columnMap = toColumnMap(columns)

    expect(columnMap.post_id).toBeDefined()
    expect(columnMap.id).toBeUndefined()

    const createdAt = columnMap.created_at
    expect(createdAt).toBeDefined()
    expect(createdAt!.is_generated).toBe('NEVER')
    expect(createdAt!.column_default).toMatch(/current_timestamp|now\(\)/i)
  })

  it.each(topicExtensionTables)(
    '%s uses topic_id and created_at defaults to row creation time',
    async tableName => {
      const columns = await getTableColumns(tableName)
      const columnMap = toColumnMap(columns)

      expect(columnMap.topic_id).toBeDefined()
      expect(columnMap.id).toBeUndefined()

      const createdAt = columnMap.created_at
      expect(createdAt).toBeDefined()
      expect(createdAt!.is_generated).toBe('NEVER')
      expect(createdAt!.column_default).toMatch(/current_timestamp|now\(\)/i)
    },
  )

  it('topic_metrics uses topic_id and created_at defaults to row creation time', async () => {
    const columns = await getTableColumns('topic_metrics')
    const columnMap = toColumnMap(columns)

    expect(columnMap.topic_id).toBeDefined()
    expect(columnMap.id).toBeUndefined()

    const createdAt = columnMap.created_at
    expect(createdAt).toBeDefined()
    expect(createdAt!.is_generated).toBe('NEVER')
    expect(createdAt!.column_default).toMatch(/current_timestamp|now\(\)/i)
  })

  it('post_topic_recommendations uses post_id and created_at defaults to row creation time', async () => {
    const columns = await getTableColumns('post_topic_recommendations')
    const columnMap = toColumnMap(columns)

    expect(columnMap.post_id).toBeDefined()
    expect(columnMap.id).toBeUndefined()
    expect(columnMap.status).toBeUndefined()

    const createdAt = columnMap.created_at
    expect(createdAt).toBeDefined()
    expect(createdAt!.is_generated).toBe('NEVER')
    expect(createdAt!.column_default).toMatch(/current_timestamp|now\(\)/i)
  })
})

async function getTableColumns(tableName: string): Promise<TableColumn[]> {
  const { rows } = await read(
    `
      SELECT
        column_name,
        is_generated,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = ANY($2::TEXT[])
    `,
    [tableName, ['id', 'post_id', 'topic_id', 'created_at', 'status']],
  )
  return rows
}

function toColumnMap(columns: TableColumn[]): Record<string, TableColumn> {
  const map: Record<string, TableColumn> = {}
  for (const column of columns) {
    map[column.column_name] = column
  }
  return map
}
