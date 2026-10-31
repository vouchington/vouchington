/** Compact monthly totals outlive the raw per-call usage rows they summarize. */
export const AI_USAGE_GROWTH_POLICIES = [
  [
    'ai_usage_community_monthly_rollups',
    'One compact cost total per live community and month survives raw usage expiry; community deletion cascades it.',
  ],
  [
    'ai_usage_global_monthly_rollups',
    'One compact total per month preserves cost facts for calls with and without a community after raw usage expiry.',
  ],
] as const
