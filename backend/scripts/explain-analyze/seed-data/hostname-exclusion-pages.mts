import { beginTransaction, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

const HOSTNAME_PARENT_COUNT = 100
const CHILD_HOSTNAMES_PER_PARENT = 10
const HOSTNAME_PREFIX = 'explain-5393-host-exclusion-'
const VIEWER_ID = seedUuid(1, '01')

/** Seed overlapping block and mute parents with descendant hostnames for exclusion plans. */
export async function seedHostnameExclusionPages(): Promise<void> {
  const hostnameCount = HOSTNAME_PARENT_COUNT * (CHILD_HOSTNAMES_PER_PARENT + 1)
  console.log(`Seeding ${hostnameCount} hostname exclusion rows...`)

  await using transaction = await beginTransaction()
  await transaction(
    `/* seedHostnameExclusionPages:hostnames */
     INSERT INTO url_hostnames (hostname, publicly_introduced_at)
     SELECT $1 || parent_number || '.example.com', CURRENT_TIMESTAMP
     FROM generate_series(0, $2 - 1) AS parents(parent_number)
     UNION ALL
     SELECT 'child-' || child_number || '.' || $1 || parent_number || '.example.com', CURRENT_TIMESTAMP
     FROM generate_series(0, $2 - 1) AS parents(parent_number)
     CROSS JOIN generate_series(0, $3 - 1) AS children(child_number)
     WHERE true
     ON CONFLICT (hostname) DO NOTHING`,
    [HOSTNAME_PREFIX, HOSTNAME_PARENT_COUNT, CHILD_HOSTNAMES_PER_PARENT],
  )

  for (const table of [
    'relation__user__block__url_hostname',
    'relation__user__mute__url_hostname',
  ] as const) {
    await transaction(
      `/* seedHostnameExclusionPages:relations */
       INSERT INTO ${table} (subject_id, object_id, created_by_id)
       SELECT $1, hostname.id, $1
       FROM url_hostnames hostname
       WHERE hostname.hostname LIKE $2 || '%'
         AND hostname.hostname NOT LIKE 'child-%'
       ON CONFLICT DO NOTHING`,
      [VIEWER_ID, HOSTNAME_PREFIX],
    )
  }

  await transaction.commit()
  await write(
    `/* seedHostnameExclusionPages:analyze */
     ANALYZE url_hostnames, relation__user__block__url_hostname, relation__user__mute__url_hostname`,
  )
}
