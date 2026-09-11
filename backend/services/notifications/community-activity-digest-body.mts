export type CommunityActivityDigestCounts = {
  community_count: number
  joins: number
  departures: number
  discussions: number
  reviews: number
  data_points: number
  comments: number
  active_posters: number
  active_members: number
  moderation_workload: number
  top_discussion: string | null
}

export function buildCommunityActivityDigestBody(row: CommunityActivityDigestCounts): string {
  const rate =
    row.active_members === 0 ? 0 : Math.round((row.active_posters * 100) / row.active_members)
  const top = row.top_discussion ? `; top discussion: ${row.top_discussion}.` : '.'
  return `${row.community_count} ${row.community_count === 1 ? 'community' : 'communities'}: ${row.joins} joined, ${row.departures} departed (net ${row.joins - row.departures}); ${row.active_members} total active members; ${row.discussions} discussions, ${row.reviews} reviews, ${row.data_points} data points, ${row.comments} comments; ${row.active_posters} active members (${rate}%); ${row.moderation_workload} items awaiting moderation${top}`.slice(
    0,
    1000,
  )
}
