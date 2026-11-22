import { addGracefulShutdownDrainCallback } from '@data-stores/graceful-shutdown'
import { beginNativeAddonShutdown, waitForNativeAddonWorkToDrain } from '@jongleberry/vurst-runtime'

type NativeAddonShutdownDependencies = {
  addGracefulShutdownDrainCallback: typeof addGracefulShutdownDrainCallback
  beginNativeAddonShutdown: typeof beginNativeAddonShutdown
  waitForNativeAddonWorkToDrain: typeof waitForNativeAddonWorkToDrain
}

const defaultNativeAddonShutdownDependencies = {
  addGracefulShutdownDrainCallback,
  beginNativeAddonShutdown,
  waitForNativeAddonWorkToDrain,
} satisfies NativeAddonShutdownDependencies

export function registerNativeAddonShutdown(
  dependencies: NativeAddonShutdownDependencies = defaultNativeAddonShutdownDependencies,
): void {
  dependencies.addGracefulShutdownDrainCallback(async () => {
    console.log('Workers: draining native addon work...')
    dependencies.beginNativeAddonShutdown()
    await dependencies.waitForNativeAddonWorkToDrain()
    console.log('Workers: native addon work drained.')
  })
}
