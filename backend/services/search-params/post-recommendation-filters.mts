export function postRecommendationFilters(
  postTypes: string[] | undefined,
  query: unknown,
  status: unknown,
) {
  return {
    ...(postTypes?.length === 1 &&
    postTypes[0] === 'topic_recommendation' &&
    typeof query === 'string'
      ? { text_search_query: undefined, topic_recommendation_q: query }
      : {}),
    ...(status === 'pending' || status === 'approved' || status === 'rejected'
      ? { topic_recommendation_status: status as 'pending' | 'approved' | 'rejected' }
      : {}),
  }
}
