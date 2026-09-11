'use client'

export function assertPathIdentifier(identifier: string): string {
  if (
    identifier === '.' ||
    identifier === '..' ||
    identifier.includes('/') ||
    identifier.includes('\\')
  ) {
    throw new Error('Invalid identifier')
  }

  return identifier
}

export function assertEncodablePathSegmentIdentifier(identifier: string): string {
  if (identifier === '.' || identifier === '..' || identifier.includes('\\')) {
    throw new Error('Invalid identifier')
  }

  return identifier
}
