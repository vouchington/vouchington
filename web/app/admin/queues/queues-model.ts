import type { Backfill, ScheduledJob } from '@/lib/api/client/mq'

export interface QueuesPageState {
  jobs: ScheduledJob[]
  backfills: Backfill[]
  loading: boolean
  error: string | null
  actionLoading: Record<string, boolean>
  pendingJob: ScheduledJob | null
  pendingBackfill: Backfill | null
}

export const queuesPageInitialState: QueuesPageState = {
  jobs: [],
  backfills: [],
  loading: true,
  error: null,
  actionLoading: {},
  pendingJob: null,
  pendingBackfill: null,
}

export type QueuesPageAction =
  | Partial<QueuesPageState>
  | ((state: QueuesPageState) => Partial<QueuesPageState>)

export function queuesPageReducer(
  state: QueuesPageState,
  action: QueuesPageAction,
): QueuesPageState {
  return { ...state, ...(typeof action === 'function' ? action(state) : action) }
}
