export function getOEmbedEndpointHostname(endpoint: string): string | null {
  try {
    return new URL(endpoint).hostname || null
  } catch {
    return null
  }
}
