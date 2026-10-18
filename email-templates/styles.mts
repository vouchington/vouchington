import { copyrightYear, createEmailStyles } from '@vouchington/email'

// Design tokens derived from the web theme tokens in web/app/globals.css — light mode palette.
// Email client dark-mode rendering is inconsistent and not reliably controllable, so we use light mode exclusively.
export const colors = {
  background: '#f5f7f9', // hsl(220 20% 97%)
  foreground: '#161820', // hsl(230 15% 10%)
  card: '#ffffff',
  primary: '#bd8c0f', // hsl(40 85% 40%) — brand gold
  primaryFg: '#ffffff',
  muted: '#eaecf1', // hsl(220 15% 93%)
  mutedFg: '#616a75', // hsl(215 10% 42%)
  border: '#d4d8de', // hsl(220 13% 85%)
  success: '#16a34a',
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',
  warmBg: '#fff8e1',
  warmBorder: '#ffe082',
  warmText: '#b8860b', // darker gold for warm banners — better contrast
} as const

export const borderRadius = '6px' // matches web --radius (0.375rem)

export const COPYRIGHT_YEAR = copyrightYear()

export const styles = createEmailStyles({ colors, borderRadius })
