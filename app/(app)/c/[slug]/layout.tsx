import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app/header";
import { requireAdmin } from "@/lib/auth/guards";
import { getCompany, listCompanies } from "@/lib/store/model";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const user = await requireAdmin();
  const { slug } = await params;
  const [company, companies] = await Promise.all([getCompany(slug), listCompanies()]);
  if (!company) notFound();
  return (
    <>
      <AppHeader user={user} companies={companies} current={company} />
      {children}
    </>
  );
}
