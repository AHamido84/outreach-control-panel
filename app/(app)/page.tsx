import { redirect } from "next/navigation";
import { listCompanies } from "@/lib/store/model";

export default async function Home() {
  const cs = (await listCompanies()).filter((c) => c.active);
  redirect(cs.length ? `/c/${cs[0].slug}` : "/companies");
}
