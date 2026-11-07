export type PostSearchRow = {
  id: string
  post_type: string
  title?: string
  data_point_vertical?: string | null
  structured_data?: unknown
  vote_score?: string | number
  ranking_score?: string | number
  following_rank?: string | number
  hot_score?: string | number
}
