import { describe, expect, it } from 'vitest'
import {
  readExtensionTableColumns,
  type ExtensionTableColumn,
} from '../../../test-helpers/data-stores/psql/schema-catalog.mts'

const topicExtensionTables = [
  'card_topics',
  'referral_program_topics',
  'rewards_program_status_topics',
  'rewards_program_topics',
  'spending_category_topics',
]

describe('extension table key columns', () => {
  it('post_review_topic_ratings uses post_id and created_at defaults to row creation time', async () => {
    const columns = await readExtensionTableColumns('post_review_topic_ratings')
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
      const columns = await readExtensionTableColumns(tableName)
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
    const columns = await readExtensionTableColumns('topic_metrics')
    const columnMap = toColumnMap(columns)

    expect(columnMap.topic_id).toBeDefined()
    expect(columnMap.id).toBeUndefined()

    const createdAt = columnMap.created_at
    expect(createdAt).toBeDefined()
    expect(createdAt!.is_generated).toBe('NEVER')
    expect(createdAt!.column_default).toMatch(/current_timestamp|now\(\)/i)
  })

  it('post_topic_recommendations uses post_id and created_at defaults to row creation time', async () => {
    const columns = await readExtensionTableColumns('post_topic_recommendations')
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

function toColumnMap(columns: ExtensionTableColumn[]): Record<string, ExtensionTableColumn> {
  const map: Record<string, ExtensionTableColumn> = {}
  for (const column of columns) {
    map[column.column_name] = column
  }
  return map
}
