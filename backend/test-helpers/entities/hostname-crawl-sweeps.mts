import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestHostnameCrawlSweep(id: string, days: number, sweptAt: string | null) {
  await write(sql`/* setTestHostnameCrawlSweep */ UPDATE url_hostnames
    SET age_threshold_days = ${days}, crawl_swept_at = ${sweptAt}::timestamptz WHERE id = ${id}::uuid`)
}

export async function getTestHostnameCrawlSweep(id: string) {
  const { rows } = await read<{ crawl_swept_at: string | null }>(sql`/* getTestHostnameCrawlSweep */
    SELECT crawl_swept_at::text FROM url_hostnames WHERE id = ${id}::uuid`)
  const value = rows[0]?.crawl_swept_at
  return value ? new Date(value).toISOString() : null
}
