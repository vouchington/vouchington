export interface RouteMatcher {
  matchRoute(method: string, path: string): { template: string } | null
}

/** Resolve a diagnostic identity through the same public matcher as live API dispatch. */
export function resolveRequestProfileRoute(app: RouteMatcher, identity: string): string {
  const methodEnd = identity.indexOf(' ')
  if (methodEnd < 1) return identity
  const method = identity.slice(0, methodEnd)
  const toolCall = identity.indexOf(' tools/call ', methodEnd + 1)
  const path = identity.slice(methodEnd + 1, toolCall < 0 ? undefined : toolCall)
  const suffix = toolCall < 0 ? '' : identity.slice(toolCall)
  try {
    const matched = app.matchRoute(method, path)
    return matched ? `${method} ${matched.template}${suffix}` : identity
  } catch {
    // Bad paths must remain unbaselined diagnostics, never affect request dispatch.
    return identity
  }
}
