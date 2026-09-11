import type { Money } from '@ts-shared/money'

export interface TopicDataPointInsights {
  total_count: number
  approved_count: number
  denied_count: number
  pending_count: number
  approval_rate: number | null
  median_credit_limits: Money[]
  credit_score_distribution: Record<string, number>
}
