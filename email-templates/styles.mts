// Design tokens derived from web/DESIGN-SYSTEM.md — light mode palette.
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

export const COPYRIGHT_YEAR = String(new Date().getFullYear())

const fontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif'

// Shared base styles used across all templates.
// Template-specific styles stay in their respective files but import colors/borderRadius above.
export const styles = {
  main: {
    backgroundColor: colors.background,
    fontFamily,
  },

  container: {
    backgroundColor: colors.card,
    margin: '0 auto',
    padding: '12px 0 24px',
    marginBottom: '32px',
  },

  section: {
    padding: '24px',
  },

  heading: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0 0 16px 0',
    color: colors.foreground,
  },

  paragraph: {
    fontSize: '14px',
    lineHeight: '22px',
    margin: '8px 0',
    color: colors.foreground,
  },

  listItem: {
    fontSize: '13px',
    lineHeight: '20px',
    margin: '6px 0 6px 16px',
    color: colors.foreground,
  },

  buttonContainer: {
    textAlign: 'center' as const,
    margin: '16px 0',
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius,
    color: colors.primaryFg,
    fontSize: '14px',
    fontWeight: 'bold',
    padding: '10px 20px',
    textDecoration: 'none',
  },

  secondaryButton: {
    backgroundColor: colors.card,
    borderRadius,
    color: colors.primary,
    fontSize: '13px',
    fontWeight: 'bold',
    padding: '8px 16px',
    textDecoration: 'none',
    border: `1px solid ${colors.primary}`,
    display: 'inline-block' as const,
  },

  codeContainer: {
    backgroundColor: colors.muted,
    borderRadius,
    padding: '12px',
    margin: '12px 0',
    textAlign: 'center' as const,
  },

  code: {
    fontSize: '16px',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: colors.foreground,
    margin: '0',
    letterSpacing: '2px',
  },

  footer: {
    textAlign: 'center' as const,
    padding: '16px 24px',
    borderTop: `1px solid ${colors.border}`,
    marginTop: '24px',
  },

  footerText: {
    fontSize: '11px',
    color: colors.mutedFg,
    margin: '0',
  },
} as const
