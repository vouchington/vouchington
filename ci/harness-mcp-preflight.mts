// Every Auto Harness prompt (a new session or a resume) starts with this gate. The hosted agent
// journals through the project-scoped vouchington-tooling MCP server, and the dispatcher cannot
// see whether that server connected on the host, so the agent probes it first. outbox_status is
// the cheapest tool: it reads the worktree outbox and never touches the hosted deployment.
export const MCP_PREFLIGHT_FAILURE =
  'PREFLIGHT FAILED: vouchington-tooling MCP server is not connected'

export const MCP_PREFLIGHT = [
  '## Preflight: vouchington-tooling MCP server',
  '',
  'Before any other work, call the `outbox_status` tool of the `vouchington-tooling` MCP server,',
  'passing the `sessionId` from the SessionStart line `Blackboard sessionId: <id>`.',
  'Continue with the task below only if the call succeeds.',
  '',
  'The preflight has failed if the tool is not available, the call errors, the SessionStart output',
  'contains `STOP WORK`, or that line is missing or says `NOT RESOLVED`. On failure, stop at once.',
  'Make no edits, push nothing, and open no pull request. Report the stop through the task',
  'stop-report channel if the task below defines one, and end your final message with exactly this line:',
  '',
  MCP_PREFLIGHT_FAILURE,
].join('\n')

export function withMcpPreflight(prompt: string): string {
  return `${MCP_PREFLIGHT}\n\n---\n\n${prompt}`
}
