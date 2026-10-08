import { generateNativeResourceFiles } from '../ts-shared/ui-messages/native-resources.mts'
import {
  assertNativeResourceLayout,
  assertNativeModerationResources,
  assertNoRetiredDotnetResources,
} from '../ts-shared/ui-messages/native-resource-contracts.mts'

if (import.meta.main) {
  const files = generateNativeResourceFiles()
  assertNativeResourceLayout(files, generateNativeResourceFiles())
  assertNativeModerationResources(files)
  assertNoRetiredDotnetResources(files)
}
