import { beginTransaction } from '@data-stores/psql'
import { updatePostTitleMarkdown } from './entities/posts.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

export async function editStoryWhileSummaryStarts(
  postId: string,
  title: string,
  markdown: string,
  writeSummary: () => Promise<void>,
): Promise<void> {
  await using edit = await beginTransaction()
  await updatePostTitleMarkdown(postId, title, markdown, { query: edit })
  const { rows } = await edit<{ process_id: number }>(
    '/* editStoryWhileSummaryStarts */ SELECT pg_backend_pid() AS process_id',
  )
  const releaseHolder = () => edit.commit()
  await withTestOwnedPostgresWait(
    {
      holderProcessId: rows[0]!.process_id,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'updateStoryPostAgentResult:writeSummary',
      releaseHolder,
    },
    async waitForLock => {
      const summary = writeSummary()
      await waitForLock(summary)
      await releaseHolder()
      return summary
    },
  )
}
