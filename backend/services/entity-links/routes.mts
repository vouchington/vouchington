export function getPostRouteSegment(postType: string) {
  if (postType === 'data_point') return 'data-point'
  return postType
}
