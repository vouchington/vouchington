// Blank-canvas layout for public landing pages.
// Intentionally omits all site chrome (sidebar, navbar, breadcrumbs, tabs, asides).
// This is the customization boundary — future per-user theme overrides live here.
export const dynamic = 'force-dynamic'

export default function LandingPageLayout({ children }: { children: React.ReactNode }) {
  return children
}
