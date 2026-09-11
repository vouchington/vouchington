export function annotationMessagesFromPages(stdout: string): string[] {
  const pages = JSON.parse(stdout.trim())
  return Array.isArray(pages)
    ? pages.flatMap(page => (Array.isArray(page) ? page.flatMap(annotationMessage) : []))
    : []
}

function annotationMessage(annotation: unknown): string[] {
  if (typeof annotation !== 'object' || annotation === null || !('message' in annotation)) {
    return []
  }
  const { message } = annotation as { message?: unknown }
  return typeof message === 'string' ? [message] : []
}
