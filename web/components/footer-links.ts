export interface FooterLink {
  label: string
  href: string | null
  dataPw: string
}

export const footerSiteLinks: FooterLink[] = [
  { label: 'Plans', href: '/plans', dataPw: 'footer-site-link-plans' },
  { label: 'Support', href: 'mailto:support@voucha.ai', dataPw: 'footer-site-link-support' },
  { label: 'Shortcuts', href: '/article/keyboard-shortcuts', dataPw: 'footer-site-link-shortcuts' },
  { label: 'About', href: '/article/about', dataPw: 'footer-site-link-about' },
  { label: 'Terms', href: '/article/terms-of-service', dataPw: 'footer-site-link-terms' },
  { label: 'Privacy', href: '/article/privacy-policy', dataPw: 'footer-site-link-privacy' },
  {
    label: 'Community Guidelines',
    href: '/article/community-guidelines',
    dataPw: 'footer-site-link-community-guidelines',
  },
  { label: 'Copyright', href: '/copyright', dataPw: 'footer-site-link-copyright' },
  {
    label: 'Designated Agent',
    href: '/copyright/designated-agent',
    dataPw: 'footer-site-link-designated-agent',
  },
  {
    label: 'Repeat Infringer Policy',
    href: '/copyright/repeat-infringer-policy',
    dataPw: 'footer-site-link-repeat-infringer-policy',
  },
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
