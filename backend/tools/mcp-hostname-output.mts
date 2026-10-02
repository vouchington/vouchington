import { indexById } from '@modules/utils'
import { getHostnameElectionByIdCachedBatch } from '@services/entity-fetch'
import { toPublicViewHostname, type ViewHostname } from '@services/urls-hostnames'
import { nullable } from './output-schema-shapes.mts'
import { closedObject, pickProperties } from './read-tool-output-schema.mts'
import {
  pageProperties,
  sanitizedTitle,
  type McpPage,
  type McpPageLimit,
} from './mcp-read-output.mts'

/** Both hostname read tools page like the signed-out REST routes: 25 at most, 25 by default. */
export const HOSTNAME_PAGE_LIMIT: McpPageLimit = { min: 1, max: 25, default: 25 }

const ELECTION_FIELDS = ['votes_count_up', 'votes_count_down', 'votes_score_net'] as const

/** One hostname with its public trust vote totals. Moderation fields never reach this shape. */
export type McpHostname = {
  id: string
  hostname: string
  topic_id: string | null
  election: { votes_count_up: number; votes_count_down: number; votes_score_net: number } | null
}

export type McpHostnamesPage = McpPage<McpHostname>

/**
 * The public view of a page of hostnames, as a signed-out REST reader gets it: `blocked`,
 * `crawlable` and the other moderation fields are dropped, and the vote totals come from the
 * hostname election.
 */
export async function toMcpHostnames(rows: ViewHostname[]): Promise<McpHostname[]> {
  const hostnames = rows.map(toPublicViewHostname)
  const elections = indexById(await getHostnameElectionByIdCachedBatch(hostnames.map(h => h.id)))
  return Promise.all(
    hostnames.map(async ({ id, hostname, topic_id }) => {
      const election = elections[id]
      return {
        id,
        hostname: await sanitizedTitle(hostname),
        topic_id,
        election: election
          ? {
              votes_count_up: election.votes_count_up,
              votes_count_down: election.votes_count_down,
              votes_score_net: election.votes_score_net,
            }
          : null,
      }
    }),
  )
}

/** The properties of an `McpHostname`, from the generated hostname contracts. */
export function mcpHostnameSchema() {
  return closedObject({
    ...pickProperties('PublicViewHostname', ['id', 'hostname', 'topic_id']),
    election: nullable(closedObject(pickProperties('ViewHostnameElection', ELECTION_FIELDS))),
  })
}

export const hostnamesPageProperties = () => pageProperties(mcpHostnameSchema())
