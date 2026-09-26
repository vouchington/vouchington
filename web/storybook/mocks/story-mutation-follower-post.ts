export function followerActionPost(endpoint: string): unknown | undefined {
  if (endpoint === '/api/v1/reports') {
    return {
      report: {
        id: 'report-story',
        status: 'pending',
        entity_type: 'post',
        entity_id: 'post-story',
      },
      isDuplicate: false,
    }
  }
  if (/\/posts\/[^/]+\/(?:shares|sends)$/.test(endpoint)) {
    return { status: 'accepted', distribution_id: 'distribution-story' }
  }
  return undefined
}
