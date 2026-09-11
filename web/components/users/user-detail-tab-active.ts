'use client'

export function getActiveTabValue(pathname: string): string {
  const [, userSegment, , ...rest] = pathname.split('/')
  if (userSegment !== 'user' || rest.length === 0) return ''
  return `/${rest.join('/')}`
}
