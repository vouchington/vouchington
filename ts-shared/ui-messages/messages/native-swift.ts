import { nativeSwiftEnMessages } from './native-swift/en.ts'
import { nativeSwiftEsMessages } from './native-swift/es.ts'
import { nativeSwiftFrMessages } from './native-swift/fr.ts'
import { nativeSwiftPtMessages } from './native-swift/pt.ts'

export const nativeSwiftMessages = {
  en: nativeSwiftEnMessages,
  es: nativeSwiftEsMessages,
  fr: nativeSwiftFrMessages,
  pt: nativeSwiftPtMessages,
} as const
