import type { UserModNote, UserModerationContext } from '@/types/api-responses'

export type PanelState =
  | { status: 'loading' | 'error' }
  | { status: 'ready'; context: UserModerationContext; notes: UserModNote[] }

export type PanelAction =
  | { type: 'loaded'; context: UserModerationContext; notes: UserModNote[] }
  | { type: 'error' }
  | { type: 'add'; note: UserModNote }
  | { type: 'remove'; noteId: string }

export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  if (action.type === 'loaded')
    return { status: 'ready', context: action.context, notes: action.notes }
  if (action.type === 'error') return { status: 'error' }
  if (action.type === 'add' && state.status === 'ready')
    return { ...state, notes: [action.note, ...state.notes] }
  if (action.type === 'remove' && state.status === 'ready')
    return { ...state, notes: state.notes.filter(n => n.id !== action.noteId) }
  return state
}

export function fmtAge(ms: number): string {
  const d = Math.floor(ms / 86_400_000)
  if (d < 1) return 'less than a day'
  if (d < 30) return `${d} day${d === 1 ? '' : 's'}`
  const y = Math.floor(d / 365)
  if (y >= 1) return `${y} year${y === 1 ? '' : 's'}`
  const m = Math.floor(d / 30)
  return `${m} month${m === 1 ? '' : 's'}`
}
