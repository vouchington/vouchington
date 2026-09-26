import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { activatePostPublicationTypedProtocol } from '@services/post-publication'
import onError from '@modules/on-error'

async function main(): Promise<void> {
  try {
    await activatePostPublicationTypedProtocol()
    console.log('Post publication typed identity protocol is active.')
  } finally {
    await shutdownDataStoresForOneOffCommand()
  }
}

main().catch(error => {
  onError(error)
  process.exitCode = 1
})
