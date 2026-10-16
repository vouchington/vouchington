export type QueueDomainControl = {
  domain: string
  paused: boolean
  pausedAt: string | null
  pausedBy: string | null
  reason: string | null
}
