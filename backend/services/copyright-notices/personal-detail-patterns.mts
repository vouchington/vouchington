// Regex sources for the personal-detail categories removed from copyright filing text.
// The combined expression is case-insensitive; `(?-i:...)` pins the parts that must be capitalised.
// Each pattern is conservative: an unusual format is left in place rather than risk removing a
// legal reference. Case/docket numbers, URLs, and other dates are protected by `preservedText`.

export const preservedText = [
  String.raw`(?:https?:\/\/|www\.)[^\s<>]+`,
  String.raw`\b\d{4}-\d{2}-\d{2}\b`,
  String.raw`\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b`,
  String.raw`\b\d+:\d{2}-[a-z]+-\d+(?:-[a-z\d]+)*\b`,
  String.raw`\b(?:case|docket|claim)\s+(?:(?:number|no\.)\s*)?#?\s*[a-z\d]+(?:[-:/][a-z\d]+)*\b`,
].join('|')

export const emailAddress = String.raw`(?<![\w.+-])[\w.!#$%&'*+/=?^\x60{|}~-]+@[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}(?![\w-])`

export const phoneNumber = [
  String.raw`(?<![\w])(?:\+?\d{1,3}[ .-])?(?:\(\d{2,4}\)|\d{2,4})[ .-]?\d{3,4}[ .-]\d{3,4}(?![\w])`,
  String.raw`(?<![\w])\d{3}[-.]\d{4}(?![\w])`,
  String.raw`(?<![\w])(?:\+\d{8,15}|\d{10})(?![\w])`,
].join('|')

const usStates =
  'A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|PR|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]'
const zipCode = String.raw`\d{5}(?:-\d{4})?`
// An optional ", City, ST 12345" tail; the state is a real USPS code so ordinary words cannot end it.
const locality = String.raw`(?:,?\s+(?-i:[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,2}),?\s+(?-i:${usStates})\b(?:\s+${zipCode}\b)?)?`
const unit = String.raw`(?:,?\s+(?:suite|ste|apt|apartment|unit|#)\.?\s*#?\s*(?=[\w-]*\d)[\w-]+)?`
// "District Court", "Supreme Court", ... name a tribunal, not a street, so they are never an address.
const tribunalWords =
  'district|federal|circuit|superior|supreme|appellate|appeals|municipal|county|states|state|family|probate|bankruptcy|claims|criminal|civil|magistrate|juvenile|traffic|tax|trial|justice|small|high|crown|city|general|admiralty|chancery|equity'
const streetType = [
  String.raw`(?:street|avenue|road|boulevard|lane|drive|way)\b|(?:st|ave|rd|blvd|ln|dr)\b\.?`,
  String.raw`(?<!\b(?:${tribunalWords})\s+)(?:court\b|ct\b\.?)`,
  String.raw`(?:suite|apt)\b\.?\s*#?\s*(?=[\w-]*\d)[\w-]+`,
].join('|')
// A dot is only allowed on a short abbreviation ("N.", "St."), so a name never runs across the
// end of a sentence such as "filed 2 Motions. Court denied". The leading `[A-Z]` is factored out
// of the alternation on purpose: V8 loses `(?-i:...)` for branches that share a leading class.
const streetNameWord = String.raw`(?-i:[A-Z](?:[A-Za-z]{0,2}\.|[\w'’-]*)|\d{1,3}(?:st|nd|rd|th))`

/** Street number, street name, and street-type word, then an optional unit and locality. */
export const streetAddress = String.raw`(?<![\w#$./:-])\d{1,5}\s+(?:${streetNameWord}\s+){1,4}?(?:${streetType})${unit}${locality}`
export const postOfficeBox = String.raw`(?<![\w])(?:P\.?\s?O\.?|post\s+office)\s*box\s+(?=[\w-]*\d)[\w-]+${locality}`

export const socialSecurityNumber = String.raw`(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])`
// The label stays in the output; only the number token after it is replaced.
export const labelledIdNumber = String.raw`(?<idPrefix>(?:(?-i:\b(?:SSN|TIN|EIN)\b)|\b(?:social\s+security|passport|driver['’]?s\s+licen[cs]e|national\s+id|tax\s+id(?:entification)?)\b)(?:\s+(?:number|no\.?|num\.?|#))?[\s:#-]*(?:(?:is|was)\s+)?)(?=[\w-]*\d)[\w-]{5,}`

const month =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const dateValue = [
  String.raw`\d{4}-\d{1,2}-\d{1,2}`,
  String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}`,
  String.raw`(?:${month})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}`,
  String.raw`\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:${month})\.?,?\s+\d{4}`,
].join('|')
// The match starts at the label, which wins over the preserved-date alternatives that would
// otherwise claim the date alone. At most three plain words may sit between label and date.
export const dateOfBirth = String.raw`(?<dobLabel>(?<![\w])(?:DOB|D\.O\.B\.|date\s+of\s+birth|birth\s*date|born)(?![a-z])[\s:]*(?:[a-z]+\s+){0,3}?)(?:${dateValue})\b`

// Card numbers are checked with Luhn and IBANs with mod-97 by the caller. A card is 13-19
// contiguous digits or a printed grouping (4-4-4-4, 4-4-4-4-3, 4-4-4-1, 4-6-4, 4-6-5), so phone
// numbers such as "0044 20 7946 0958" never enter this branch and keep their phone redaction.
export const cardNumber = String.raw`(?<![\w-])(?:\d{13,19}|\d{4}(?:[ -]\d{4}){3}(?:[ -]\d{1,3})?|\d{4}(?:[ -]\d{4}){2}[ -]\d|\d{4}[ -]\d{6}[ -]\d{4,5})(?![\w-])`
export const ibanNumber = String.raw`(?-i:(?<![\w])[A-Z]{2}\d{2}(?: ?[A-Z\d]{4})(?: ?(?=[A-Z]{0,3}\d)[A-Z\d]{4}){1,6}(?: ?(?=[A-Z]{0,2}\d)[A-Z\d]{1,3})?(?![\w]))`
