// Pure text for the SessionStart context, kept free of workspace imports so the hook can still
// print a "not resolved" line when the resolver itself cannot load.
export function renderSessionLine(sessionId: string | undefined, failure?: string): string {
  if (sessionId !== undefined) {
    return (
      `Blackboard sessionId: ${sessionId} (pass it as sessionId to every vouchington-tooling MCP ` +
      'call; a spawned child agent registers its own id with session_ensure, never this one).'
    )
  }
  const cause = failure === undefined ? 'no id in this hook payload or environment' : failure
  return (
    `Blackboard sessionId: NOT RESOLVED (${cause}). Do not guess or reuse another session's id; ` +
    'stop journaling and report it.'
  )
}
