export const dynamic = 'force-dynamic'
import { createReferralProgramValidationDetailPage } from '@/lib/routes/referral-validation-factories'
const page = createReferralProgramValidationDetailPage()
export const generateMetadata = page.generateMetadata
export default page.default
