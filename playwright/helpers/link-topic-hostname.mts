import { write } from '../../backend/data-stores/psql/clients.mts'
import { setTopicHostnameLink } from '../../backend/services/topics/hostname-link.mts'

export async function linkTopicHostname(topicId: string, hostname: string): Promise<string> {
  const result = await write(
    `INSERT INTO url_hostnames (hostname)
     VALUES ($1)
     RETURNING id`,
    [hostname],
  )
  const hostnameId = result.rows[0].id as string

  await setTopicHostnameLink(topicId, hostnameId)

  return hostnameId
}
