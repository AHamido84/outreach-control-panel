import { requireUser } from "@/lib/auth/guards";

/** Every page under (app) requires an allowed user. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
