import {
  toModerationAppealSummary,
  type ModerationAppeal,
  type ModerationAppealSummary,
} from '@/types/appeals'

interface State {
  /** Full appeals read when a row was opened, or returned by a staff action on it. */
  appealOverrides: Record<string, ModerationAppeal>
  draftEdits: Record<string, string>
  openId: string | null
}

type Action =
  | { type: 'update_appeal'; appeal: ModerationAppeal }
  | { type: 'open_appeal'; appeal: ModerationAppeal }
  | { type: 'close_appeal' }
  | { type: 'reconcile_rerun_appeal'; appeal: ModerationAppeal }
  | { type: 'edit_draft'; id: string; text: string }

export const initialAppealsClientState: State = {
  appealOverrides: {},
  draftEdits: {},
  openId: null,
}

// oxlint-disable-next-line typescript/consistent-return -- Typed action.type switch is exhaustive; Oxlint misses its terminal flow.
export function appealsClientReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'update_appeal': {
      return {
        ...state,
        appealOverrides: { ...state.appealOverrides, [action.appeal.id]: action.appeal },
      }
    }
    case 'open_appeal': {
      return {
        ...state,
        openId: action.appeal.id,
        appealOverrides: { ...state.appealOverrides, [action.appeal.id]: action.appeal },
      }
    }
    case 'close_appeal': {
      return { ...state, openId: null }
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

/** A row stands for the full appeal once staff opened or changed it. */
export function withAppealOverrides(
  appeals: ModerationAppealSummary[],
  overrides: Record<string, ModerationAppeal>,
): ModerationAppealSummary[] {
  return appeals.map(appeal => {
    const override = overrides[appeal.id]
    return override ? toModerationAppealSummary(override) : appeal
  })
}
