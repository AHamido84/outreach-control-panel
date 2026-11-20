import { redirect } from "next/navigation";

// Overview comes in the next step; until then a company opens on its settings.
export default async function CompanyHome({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/c/${(await params).slug}/settings`);
}
