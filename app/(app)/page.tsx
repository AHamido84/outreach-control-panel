import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getSettings, listCompanies } from "@/lib/store/model";

export default async function Home() {
  const user = await requireAdmin();
  if (user.role === "owner" && !(await getSettings()).setupDone) redirect("/setup");
  const cs = (await listCompanies()).filter((c) => c.active);
  redirect(cs.length ? `/c/${cs[0].slug}` : "/companies");
}
