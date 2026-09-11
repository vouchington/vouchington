export const dynamic = 'force-dynamic'
import { createReferralProgramValidationsListPage } from '@/lib/routes/referral-validation-factories'
const page = createReferralProgramValidationsListPage()
export const generateMetadata = page.generateMetadata
export default page.default
