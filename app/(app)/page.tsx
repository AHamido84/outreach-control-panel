import { redirect } from "next/navigation";
import { requireUser, visibleCompanies } from "@/lib/auth/guards";
import { getSettings } from "@/lib/store/model";

export default async function Home() {
  const user = await requireUser();
  if (!(await getSettings()).setupDone) redirect("/setup");
  const cs = (await visibleCompanies(user)).filter((c) => c.active);
  redirect(cs.length ? `/c/${cs[0].slug}` : "/companies");
}
