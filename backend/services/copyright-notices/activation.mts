import assert from 'http-assert'

export function isCopyrightIntakeEnabled(): boolean {
  return process.env.COPYRIGHT_INTAKE_ENABLED?.trim().toLowerCase() === 'true'
}

export function assertCopyrightIntakeEnabled(): void {
  assert(isCopyrightIntakeEnabled(), 503, 'Copyright intake is not available')
}
