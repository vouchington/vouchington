import { nativeSwiftIntegrityMessagesEn } from './integrity-en.ts'
import { nativeSwiftIntegrityMessagesEs } from './integrity-es.ts'
import { nativeSwiftIntegrityMessagesFr } from './integrity-fr.ts'
import { nativeSwiftIntegrityMessagesPt } from './integrity-pt.ts'

export const nativeSwiftIntegrityMessages = {
  en: nativeSwiftIntegrityMessagesEn,
  es: nativeSwiftIntegrityMessagesEs,
  fr: nativeSwiftIntegrityMessagesFr,
  pt: nativeSwiftIntegrityMessagesPt,
} as const
