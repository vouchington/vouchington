import type { HeartbeatData, HeartbeatResult } from '@queues/heartbeat/types'

export function processHeartbeat(data: HeartbeatData): HeartbeatResult {
  return { ...data, processedAt: Date.now() }
}
