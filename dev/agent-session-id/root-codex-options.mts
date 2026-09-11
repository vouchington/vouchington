export type RootCodexOptions = {
  agentArg?: string
  newRootCodexSession?: boolean
  parentSessionId?: string
  rootCodex?: boolean
  sessionIdArg?: string
}

export function validateRootCodexOptions(options: RootCodexOptions): void {
  if (options.rootCodex && options.agentArg !== undefined && options.agentArg !== 'codex')
    throw new Error('--root-codex requires --agent codex when --agent is provided')
  if (options.rootCodex && options.sessionIdArg !== undefined)
    throw new Error('--root-codex cannot be used with --session-id')
  if (options.newRootCodexSession && !options.rootCodex)
    throw new Error('--new-root-codex-session requires --root-codex')
  if (options.newRootCodexSession && options.sessionIdArg !== undefined)
    throw new Error('--new-root-codex-session cannot be used with --session-id')
  if (options.newRootCodexSession && options.parentSessionId !== undefined)
    throw new Error('--new-root-codex-session cannot be used with --parent-session-id')
  if (options.rootCodex && options.parentSessionId !== undefined)
    throw new Error('--root-codex cannot be used with --parent-session-id')
}
