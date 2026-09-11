import type { TopicsResponseBody } from './api-responses'
import type { HostnameElection } from './hostnames'
import type { Topic, TopicElection } from './topics'

export interface FediverseInstanceAttributes {
  software: string | null
  protocol: string | null
  nodeinfo_software_version: string | null
  total_users: number | null
  monthly_active_users: number | null
  open_registrations: boolean | null
}

export type FediverseInstancesResponse = Omit<
  TopicsResponseBody,
  'bookmarks' | 'election_votes' | 'topic_elections' | 'markdown_to_html'
> & {
  fediverse_instances: Record<string, FediverseInstanceAttributes>
  hostname_elections: Record<string, HostnameElection>
  topic_elections: NonNullable<TopicsResponseBody['topic_elections']>
  markdown_to_html: NonNullable<TopicsResponseBody['markdown_to_html']>
  bookmarks: NonNullable<TopicsResponseBody['bookmarks']>
  election_votes: NonNullable<TopicsResponseBody['election_votes']>
}

export interface FediverseInstanceResponse {
  topic: Topic
  fediverse_instance: FediverseInstanceAttributes | null
  topic_election: TopicElection | null
  hostname_election: HostnameElection | null
}
