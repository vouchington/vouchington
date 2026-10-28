import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestCommunityMarkdown(
  communityId: string,
  markdown: string,
): Promise<void> {
  await write(sql`/* setTestCommunityMarkdown */
    UPDATE communities SET markdown = ${markdown} WHERE id = ${communityId}::uuid
  `)
}
