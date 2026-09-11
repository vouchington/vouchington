export type ViewHostname = {
  __entity_type: 'hostname'
  id: string
  hostname: string
  topic_id: string | null
  blocked: boolean
  crawlable: boolean | null
  skip_web_risk: boolean
  link_rel_follow: boolean | null
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export type PublicViewHostname = Pick<
  ViewHostname,
  '__entity_type' | 'id' | 'hostname' | 'topic_id'
>

export type ViewHostnameWithoutElection = Omit<
  ViewHostname,
  'votes_score_net' | 'votes_count_up' | 'votes_count_down'
>

export function stripHostnameElectionFields(hostname: ViewHostname): ViewHostnameWithoutElection {
  const {
    votes_score_net: _score,
    votes_count_up: _up,
    votes_count_down: _down,
    ...hostnameWithoutElection
  } = hostname
  return hostnameWithoutElection
}

export function toPublicViewHostname(hostname: ViewHostname): PublicViewHostname {
  const hostnameWithoutElection = stripHostnameElectionFields(hostname)
  const {
    blocked: _b,
    crawlable: _c,
    skip_web_risk: _s,
    link_rel_follow: _l,
    ...publicHostname
  } = hostnameWithoutElection
  return publicHostname
}
