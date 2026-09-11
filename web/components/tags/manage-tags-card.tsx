import { Card } from '@/components/ui/card'

interface ManageTagsCardProps {
  heading: string
  children: React.ReactNode
  hideCardStyles?: boolean
}

export function ManageTagsCard({ heading, children, hideCardStyles = false }: ManageTagsCardProps) {
  const content = (
    <>
      <h2
        className='mb-3 text-lg font-semibold'
        data-pw='manage-tags-active-heading'
      >
        {heading}
      </h2>
      {children}
    </>
  )

  if (hideCardStyles) {
    return <div>{content}</div>
  }

  return <Card className='p-4'>{content}</Card>
}
