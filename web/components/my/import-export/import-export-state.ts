import type { ImportProgress } from '@/lib/api/client/import-stream'

export interface State {
  rssFeedUrls: string
  importingFeeds: boolean
  exportingFeeds: boolean
  exportingTopics: boolean
  importProgress: ImportProgress | null
}

export const initialState: State = {
  rssFeedUrls: '',
  importingFeeds: false,
  exportingFeeds: false,
  exportingTopics: false,
  importProgress: null,
}

export type Action = Partial<State> | ((state: State) => Partial<State>)

export function reducer(state: State, action: Action): State {
  return { ...state, ...(typeof action === 'function' ? action(state) : action) }
}
