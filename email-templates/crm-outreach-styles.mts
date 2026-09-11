import { colors } from './styles.mts'

export const main = {
  backgroundColor: '#f4f4f4',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

export const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

export const section = {
  padding: '40px',
}

export const imageContainer = {
  marginBottom: '24px',
}

export const heroImage = {
  width: '100%',
  maxWidth: '560px',
  borderRadius: '8px',
}

export const greeting = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#333333',
  margin: '0 0 16px 0',
}

export const bodyStyle = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#333333',
}

export const ctaContainer = {
  textAlign: 'center' as const,
  margin: '24px 0',
}

export const ctaButton = {
  backgroundColor: '#000000',
  borderRadius: '4px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  padding: '12px 24px',
  display: 'inline-block',
}

export const signature = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#333333',
  margin: '24px 0 0 0',
}

export const footer = {
  textAlign: 'center' as const,
  padding: '20px 40px',
  borderTop: '1px solid #e0e0e0',
  marginTop: '40px',
}

export const footerText = {
  fontSize: '12px',
  color: '#999999',
  margin: '0',
}

export const footerLink = {
  color: colors.primary,
  textDecoration: 'underline',
}
