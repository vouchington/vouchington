export const dynamic = 'force-dynamic'

interface LayoutProps {
  children: React.ReactNode
}

export default function CommunityListsLayout({ children }: LayoutProps) {
  return <div className='space-y-4'>{children}</div>
}
