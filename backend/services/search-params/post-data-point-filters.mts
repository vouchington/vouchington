/** Project the validated public data-point filters into the shared post search options. */
export function postDataPointFilters(result: unknown, scoreRange: unknown) {
  return {
    ...(typeof result === 'string' && { data_point_result: result }),
    ...(typeof scoreRange === 'string' && { data_point_credit_score_range: scoreRange }),
  }
}
