import { write } from '../../backend/data-stores/psql/clients.mts'

interface TestFediverseInstanceMetadata {
  software: string
  protocol: string
  version: string
  totalUsers: number
  monthlyActiveUsers: number
  openRegistrations: boolean
}

export async function insertTestFediverseInstanceMetadata(
  topicId: string,
  hostnameId: string,
  metadata: TestFediverseInstanceMetadata,
): Promise<void> {
  await write(
    `INSERT INTO topics__fediverse_instances (
       topic_id,
       software,
       protocol,
       nodeinfo_software_version,
       total_users,
       monthly_active_users,
       open_registrations
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      topicId,
      metadata.software,
      metadata.protocol,
      metadata.version,
      metadata.totalUsers,
      metadata.monthlyActiveUsers,
      metadata.openRegistrations,
    ],
  )
  await write(
    `UPDATE url_hostnames
     SET votes_score_up = 12,
         votes_score_down = 2,
         votes_count_up = 12,
         votes_count_down = 2
     WHERE id = $1`,
    [hostnameId],
  )
}
