export const dynamic = 'force-dynamic'
import { createReferralProgramValidationNewPage } from '@/lib/routes/referral-validation-factories'
const page = createReferralProgramValidationNewPage()
export const generateMetadata = page.generateMetadata
export default page.default
