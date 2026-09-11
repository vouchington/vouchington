import { codesData } from './codes-data.mts'

export interface LinguaLanguage {
  iso6391: string
  iso6393: string
  englishName: string
}

export const LINGUA_LANGUAGES: readonly Readonly<LinguaLanguage>[] = codesData

export type Iso6391Code = (typeof LINGUA_LANGUAGES)[number]['iso6391']

export const LINGUA_ISO6391_SET = new Set<string>(LINGUA_LANGUAGES.map(l => l.iso6391))
