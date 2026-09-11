/** `[singular, plural]` label pair per relative-duration unit. */
export type TimeAgoUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export type TimeAgoNouns = Record<TimeAgoUnit, readonly [singular: string, plural: string]>

/** Locale-specific "N units ago" prefix/suffix wrapping — English suffixes, the others prefix. */
export type TimeAgoPhrase = (value: number, noun: string) => string

export const TIME_AGO_NOUNS_EN: TimeAgoNouns = {
  minute: ['minute', 'minutes'],
  hour: ['hour', 'hours'],
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
}

export const TIME_AGO_NOUNS_ES: TimeAgoNouns = {
  minute: ['minuto', 'minutos'],
  hour: ['hora', 'horas'],
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años'],
}

export const TIME_AGO_NOUNS_FR: TimeAgoNouns = {
  minute: ['minute', 'minutes'],
  hour: ['heure', 'heures'],
  day: ['jour', 'jours'],
  week: ['semaine', 'semaines'],
  month: ['mois', 'mois'],
  year: ['an', 'ans'],
}

export const TIME_AGO_NOUNS_PT: TimeAgoNouns = {
  minute: ['minuto', 'minutos'],
  hour: ['hora', 'horas'],
  day: ['dia', 'dias'],
  week: ['semana', 'semanas'],
  month: ['mês', 'meses'],
  year: ['ano', 'anos'],
}

export const phraseEs: TimeAgoPhrase = (value, noun) => `hace ${value} ${noun}`
export const phraseFr: TimeAgoPhrase = (value, noun) => `il y a ${value} ${noun}`
export const phrasePt: TimeAgoPhrase = (value, noun) => `há ${value} ${noun}`
