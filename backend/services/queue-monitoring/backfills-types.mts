export type Backfill = {
  id: string
  queue_name: string
  job_name: string
  description: string
  source_table: string
}

export type BackfillTrigger = () => Promise<unknown>

export type BackfillEntry = Backfill & {
  trigger: BackfillTrigger
}
