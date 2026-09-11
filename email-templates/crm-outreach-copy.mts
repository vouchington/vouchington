export const copyByLocale = {
  en: {
    preview: (senderName: string) => `A message from ${senderName}`,
    greeting: (contactName: string) => `Hi ${contactName},`,
    signoff: (senderName: string) => `Best,\n${senderName}`,
    learnMore: 'Learn More',
    unsubscribe: 'Unsubscribe',
    subject: (senderName: string) => `A message from ${senderName}`,
  },
  es: {
    preview: (senderName: string) => `Un mensaje de ${senderName}`,
    greeting: (contactName: string) => `Hola ${contactName},`,
    signoff: (senderName: string) => `Saludos,\n${senderName}`,
    learnMore: 'Más información',
    unsubscribe: 'Cancelar suscripción',
    subject: (senderName: string) => `Un mensaje de ${senderName}`,
  },
  fr: {
    preview: (senderName: string) => `Un message de ${senderName}`,
    greeting: (contactName: string) => `Bonjour ${contactName},`,
    signoff: (senderName: string) => `Cordialement,\n${senderName}`,
    learnMore: 'En savoir plus',
    unsubscribe: 'Se désabonner',
    subject: (senderName: string) => `Un message de ${senderName}`,
  },
  pt: {
    preview: (senderName: string) => `Uma mensagem de ${senderName}`,
    greeting: (contactName: string) => `Olá ${contactName},`,
    signoff: (senderName: string) => `Atenciosamente,\n${senderName}`,
    learnMore: 'Saiba mais',
    unsubscribe: 'Cancelar inscrição',
    subject: (senderName: string) => `Uma mensagem de ${senderName}`,
  },
} as const
