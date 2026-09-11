const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

// Session ids feed both a glob pattern (retrospective transcript lookup) and an
// agent-blackboard session id: reject anything that isn't a plain token so
// neither can be steered outside its intended directory.
export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId)
}
