import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { ProviderIcon } from './oauth-provider-icons'
import { providerButtonClassNames } from './oauth-provider-configs'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FacebookUnavailableButton() {
  const t = useTranslations()
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='outline'
            className={`w-full justify-start gap-3 ${providerButtonClassNames.facebook} cursor-not-allowed opacity-50 hover:bg-background`}
            aria-disabled='true'
            aria-label={t(
              'extracted.auth.oauthProviderButtons.continueWithFacebookUnavailable_eb303cba',
            )}
            onClick={event => event.preventDefault()}
            data-pw='oauth-provider-button-facebook'
          >
            <span className='shrink-0'>
              <ProviderIcon provider='facebook' />
            </span>
            {t('extracted.auth.oauthProviderButtons.continueWithFacebook_f154b630')}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t('extracted.auth.oauthProviderButtons.facebookLoginIsTemporarilyUnavailable_06b18a1f')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
