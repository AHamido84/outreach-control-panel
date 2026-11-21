import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/header";
import { requireCompany, visibleCompanies } from "@/lib/auth/guards";
import { getSettings } from "@/lib/store/model";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, company } = await requireCompany(slug);
  if (!(await getSettings()).setupDone) redirect("/setup");
  const companies = await visibleCompanies(user);
  return (
    <>
      <AppHeader user={user} companies={companies} current={company} />
      {children}
    </>
  );
}
