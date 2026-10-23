import {
  renderPostToolReminder as renderReminder,
  type PostToolTmuxOptions,
} from 'vouchington-tooling/tmux'
import { hookToolName } from './codex-hooks/hook-payload.mts'
import type { HookPayload } from './codex-hooks/types.mts'

export function renderPostToolReminder(
  payload: HookPayload,
  options?: PostToolTmuxOptions,
): string | null {
  const env = options?.env ?? process.env
  return renderReminder(
    { ...payload, tool_name: hookToolName(payload) },
    {
      ...options,
      env: { ...env, TMUX_TARGET_BIN: env.VOUCHA_TMUX_BIN ?? env.TMUX_TARGET_BIN },
      nameCommand: 'pnpm exec vouchington tmux name',
    },
  )
}
