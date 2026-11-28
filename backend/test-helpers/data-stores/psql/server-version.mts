import { read, write } from '@data-stores/psql'

type PoolQuery = typeof read

async function getPostgresServerVersionNum(query: PoolQuery): Promise<number> {
  const { rows } = await query<{ server_version_num: string }>(
    '/* testPostgresServerVersionNum */ SHOW server_version_num',
  )
  const parsed = Number.parseInt(rows[0]!.server_version_num, 10)
  if (!Number.isInteger(parsed)) {
    throw new Error(`Unexpected server_version_num: ${rows[0]!.server_version_num}`)
  }
  return parsed
}

export function getReadPoolServerVersionNum(): Promise<number> {
  return getPostgresServerVersionNum(read)
}

export function getWritePoolServerVersionNum(): Promise<number> {
  return getPostgresServerVersionNum(write)
}
