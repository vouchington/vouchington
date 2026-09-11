export type HeartbeatJobName = 'heartbeat' | 'publish-glidemq-stats'

export type HeartbeatData = {
  id?: string
  enqueuedAt?: number
}

export type HeartbeatResult = HeartbeatData & {
  processedAt: number
}
