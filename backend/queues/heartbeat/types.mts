export type HeartbeatData = {
  id?: string
  enqueuedAt?: number
}

export type HeartbeatResult = HeartbeatData & {
  processedAt: number
}
