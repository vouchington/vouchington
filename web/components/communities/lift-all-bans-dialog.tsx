import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function LiftAllBansDialog({
  userLabel,
  disabled,
  onConfirm,
}: {
  userLabel: string
  disabled: boolean
  onConfirm: () => void
}) {
  const t = useTranslations()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size='sm'
          variant='outline'
          disabled={disabled}
        >
          {t('moderation.communityBans.liftAll')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('moderation.communityBans.confirmLiftAll')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('moderation.communityBans.confirmLiftAllDescription', { userLabel })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('moderation.communityBans.liftAll')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
