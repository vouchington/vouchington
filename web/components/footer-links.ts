export interface FooterLink {
  label: string
  href: string | null
  dataPw: string
}

export const footerSiteLinks: FooterLink[] = [
  { label: 'Plans', href: '/plans', dataPw: 'footer-site-link-plans' },
  { label: 'Shortcuts', href: '/article/keyboard-shortcuts', dataPw: 'footer-site-link-shortcuts' },
  { label: 'About', href: '/article/about', dataPw: 'footer-site-link-about' },
  { label: 'Terms', href: '/article/terms-of-service', dataPw: 'footer-site-link-terms' },
  { label: 'Privacy', href: '/article/privacy-policy', dataPw: 'footer-site-link-privacy' },
  { label: 'Cookies', href: '/article/cookie-policy', dataPw: 'footer-site-link-cookies' },
]

export const footerContentLinks: FooterLink[] = [
  { label: 'Stories', href: '/stories', dataPw: 'footer-content-link-stories' },
  { label: 'Discussions', href: '/discussions', dataPw: 'footer-content-link-discussions' },
  { label: 'Data Points', href: '/data-points', dataPw: 'footer-content-link-data-points' },
  { label: 'Reviews', href: '/reviews', dataPw: 'footer-content-link-reviews' },
  { label: 'Blog Posts', href: '/blog', dataPw: 'footer-content-link-blog-posts' },
  { label: 'Domains', href: '/domains', dataPw: 'footer-content-link-domains' },
]
