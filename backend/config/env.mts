export function readOptionalConfigEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value || value === 'PLACEHOLDER') return ''
  return value
}

export function readOptionalConfigEnvWithDefault(name: string, fallback: string): string {
  return readOptionalConfigEnv(name) || fallback
}
