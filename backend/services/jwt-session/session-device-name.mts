export function normalizeDeviceName(deviceName?: string | null, userAgent?: string | null): string {
  const trimmed = deviceName?.trim()
  if (trimmed) return trimmed.slice(0, 255).trim()

  const derived = deriveDeviceName(userAgent)
  return derived.slice(0, 255).trim()
}

export function normalizeText(value?: string | null, maxLength = 1024): string {
  return value?.trim().slice(0, maxLength).trim() ?? ''
}

export function normalizeIpAddress(ipAddress?: string | null): string | null {
  const trimmed = ipAddress?.trim()
  return trimmed ? trimmed : null
}

function deriveDeviceName(userAgent?: string | null): string {
  const normalized = userAgent?.trim()
  if (!normalized) return 'Unknown device'

  const device = detectDeviceFamily(normalized)
  const browser = detectBrowserFamily(normalized)

  if (browser === 'Unknown browser') return device
  if (device === 'Unknown device') return browser
  return `${browser} on ${device}`
}

function detectBrowserFamily(userAgent: string): string {
  if (userAgent.includes('Edg/')) return 'Edge'
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) return 'Opera'
  if (userAgent.includes('Firefox/')) return 'Firefox'
  if (
    (userAgent.includes('Chrome/') || userAgent.includes('CriOS/')) &&
    !userAgent.includes('Chromium') &&
    !userAgent.includes('Edg/')
  )
    return 'Chrome'
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) return 'Safari'
  return 'Unknown browser'
}

function detectDeviceFamily(userAgent: string): string {
  if (userAgent.includes('iPhone')) return 'iPhone'
  if (userAgent.includes('iPad')) return 'iPad'
  if (userAgent.includes('Android')) return 'Android'
  if (userAgent.includes('Windows NT')) return 'Windows'
  if (userAgent.includes('Macintosh')) return 'Mac'
  if (userAgent.includes('Linux')) return 'Linux'
  return 'Unknown device'
}
