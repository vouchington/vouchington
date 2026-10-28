export interface QueueStatsSummary {
  totalWaiting: number
  totalActive: number
  totalDelayed: number
  totalCompleted: number
  totalFailed: number
  queueCount: number
}

export interface ExportTopic {
  name: string
  slug: string
  topic_type: string
}
