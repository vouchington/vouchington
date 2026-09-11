interface PostAction {
  postId: string
  type: 'reject'
}

export interface ModQueueState {
  activeAction: PostAction | null
  error: string | null
  loading: string | null
  rejectionReason: string
  resolvedPostIds: ReadonlySet<string>
  resolvedReportIds: ReadonlySet<string>
}

export type ModQueueAction =
  | { type: 'fail'; message: string }
  | { type: 'reject-cancelled' }
  | { type: 'reject-reason-changed'; value: string }
  | { type: 'reject-started'; postId: string }
  | { type: 'report-resolved'; reportId: string }
  | { type: 'post-resolved'; postId: string }
  | { type: 'start'; id: string }
  | { type: 'stop' }

export const initialModQueueState: ModQueueState = {
  activeAction: null,
  error: null,
  loading: null,
  rejectionReason: '',
  resolvedPostIds: new Set(),
  resolvedReportIds: new Set(),
}

export function modQueueReducer(state: ModQueueState, action: ModQueueAction): ModQueueState {
  switch (action.type) {
    case 'fail': {
      return { ...state, error: action.message, loading: null }
    }
    case 'reject-cancelled': {
      return { ...state, activeAction: null, rejectionReason: '' }
    }
    case 'reject-reason-changed': {
      return { ...state, rejectionReason: action.value }
    }
    case 'reject-started': {
      return {
        ...state,
        activeAction: { postId: action.postId, type: 'reject' },
        rejectionReason: '',
      }
    }
    case 'report-resolved': {
      return {
        ...state,
        resolvedReportIds: new Set(state.resolvedReportIds).add(action.reportId),
      }
    }
    case 'post-resolved': {
      return {
        ...state,
        resolvedPostIds: new Set(state.resolvedPostIds).add(action.postId),
      }
    }
    case 'start': {
      return { ...state, error: null, loading: action.id }
    }
    case 'stop': {
      return { ...state, loading: null }
    }
  }
}
