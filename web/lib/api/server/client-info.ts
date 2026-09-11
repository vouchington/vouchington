export function buildWebClientInfoHeaders(): Record<string, string> {
  return {
    'x-voucha-client': 'web',
    'x-voucha-platform': 'web',
    'x-voucha-app-version':
      process.env.NEXT_PUBLIC_GIT_COMMIT || process.env.GIT_COMMIT || 'development',
  }
}
