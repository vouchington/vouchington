const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/
const SAFE_CLASS = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/

export function useFullConsoleOutput(): boolean {
  return (process.env.NODE_ENV || 'development') === 'development' || !!process.env.CI
}

export function formatConsoleError(error: Error): string {
  try {
    const projection = projectError(error, 0)
    // Remove the entire message first: multiline messages can themselves contain `at ...` text.
    const heading = error.name
      ? error.message
        ? `${error.name}: ${error.message}`
        : error.name
      : error.message
    const stack = error.stack ?? ''
    const frames = (stack.startsWith(heading) ? stack.slice(heading.length) : '')
      .split('\n')
      .filter(line => /^\s+at\s+(?:.+ \()?[^()\r\n]+:\d+:\d+\)?$/.test(line))
    return `${projection.name}: ${JSON.stringify({ ...projection, frames })}`
  } catch {
    return 'Error: [Unavailable error metadata]'
  }
}

type ErrorProjection = {
  name: string
  code?: string
  status?: number
  statusCode?: number
  cause?: ErrorProjection
}

function projectError(error: Error, depth: number): ErrorProjection {
  const fields = error as Error & { code?: unknown; status?: unknown; statusCode?: unknown }
  const name = SAFE_CLASS.test(error.name) ? error.name : error.constructor.name
  return {
    name: SAFE_CLASS.test(name) ? name : 'Error',
    ...(typeof fields.code === 'string' && SAFE_CODE.test(fields.code)
      ? { code: fields.code }
      : {}),
    ...(typeof fields.status === 'number' && Number.isFinite(fields.status)
      ? { status: fields.status }
      : {}),
    ...(typeof fields.statusCode === 'number' && Number.isFinite(fields.statusCode)
      ? { statusCode: fields.statusCode }
      : {}),
    ...(depth < 3 && error.cause instanceof Error
      ? { cause: projectError(error.cause, depth + 1) }
      : {}),
  }
}

/** Deployed recorders retain selected finite numbers and validated diagnostic identifiers. */
export function consoleContext(
  context: Record<string, unknown>,
  fullContext: Record<string, unknown> = context,
): Record<string, unknown> {
  if (useFullConsoleOutput()) return fullContext
  return Object.fromEntries(
    Object.entries(context).filter(
      ([, value]) =>
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && SAFE_CODE.test(value)),
    ),
  )
}
