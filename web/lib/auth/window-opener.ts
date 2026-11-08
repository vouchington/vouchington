export interface WindowOpener {
  readonly closed?: boolean
  postMessage(message: unknown, targetOrigin: string): void
}

export function getWindowOpener(): WindowOpener | null {
  const opener: unknown = window.opener
  if (!isWindowOpener(opener)) return null
  return opener
}

function isWindowOpener(value: unknown): value is WindowOpener {
  return (
    typeof value === 'object' &&
    value !== null &&
    'postMessage' in value &&
    typeof value.postMessage === 'function' &&
    (!('closed' in value) || typeof value.closed === 'boolean')
  )
}
