export const TEST_USER_EMAIL = process.env.WEB_INTEGRATION_TEST_USER_EMAIL ?? 'tests@voucha.ai'
export const TEST_USER_ID = '019f0000-0000-7000-8000-000000000000'
export const TEST_USER_USERNAME = 'tests'
export const GOOGLEBOT_UA = 'Googlebot/2.1 (+http://www.google.com/bot.html)'

// Playwright v1.58 devices['Desktop Chrome'] UA — matches what Playwright sends in headed/debug mode
export const PLAYWRIGHT_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.6 Safari/537.36'

const EXPECTED_PERMISSIONS_POLICY = [
  'accelerometer=()',
  'attribution-reporting=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'gamepad=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'idle-detection=()',
  'interest-cohort=()',
  'join-ad-interest-group=()',
  'local-fonts=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'run-ad-auction=()',
  'screen-wake-lock=()',
  'serial=()',
  'speaker-selection=()',
  'sync-xhr=()',
  'usb=()',
  'web-share=()',
  'xr-spatial-tracking=()',
].join(', ')

export const SEEDED_IDS = {
  topic: '019c64e6-f710-74cb-b36d-130af8ff1067',
  discussion: '019c64e6-f720-7001-a001-000000000001',
  review: '019c64e6-f720-7002-a002-000000000001',
  dataPoint: '019c64e6-f720-7003-a003-000000000001',
  rewardsProgram: '019c64e6-b100-7000-b000-000000000001',
  rewardsProgramStatus: '019c64e6-b200-7000-b000-000000000001',
  genericTopic: '019c64e6-b300-7000-b000-000000000001',
  referralProgram: '019c64e6-b400-7000-b000-000000000001',
} as const

export const HTML_SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'x-xss-protection': '0',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': EXPECTED_PERMISSIONS_POLICY,
  'cross-origin-opener-policy': 'same-origin-allow-popups',
  'cross-origin-resource-policy': 'same-origin',
} as const
