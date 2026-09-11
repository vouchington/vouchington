import type { ModerationAppeal } from '@/types/appeals'

interface State {
  appealOverrides: Record<string, ModerationAppeal>
  draftEdits: Record<string, string>
}

type Action =
  | { type: 'update_appeal'; appeal: ModerationAppeal }
  | { type: 'reconcile_rerun_appeal'; appeal: ModerationAppeal }
  | { type: 'edit_draft'; id: string; text: string }

export const initialAppealsClientState: State = {
  appealOverrides: {},
  draftEdits: {},
}

export function appealsClientReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'update_appeal': {
      return {
        ...state,
        appealOverrides: { ...state.appealOverrides, [action.appeal.id]: action.appeal },
      }
    }
    case 'reconcile_rerun_appeal': {
      const draftEdits = Object.fromEntries(
        Object.entries(state.draftEdits).filter(([id]) => id !== action.appeal.id),
      )
      return {
        ...state,
        appealOverrides: { ...state.appealOverrides, [action.appeal.id]: action.appeal },
        draftEdits,
      }
    }
    case 'edit_draft': {
      return { ...state, draftEdits: { ...state.draftEdits, [action.id]: action.text } }
    }
  }
}
