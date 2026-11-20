import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ar } from "@/content/ar";
import { signIn } from "@/lib/auth/auth";
import { currentUser } from "@/lib/auth/guards";
import { missingConfig } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function ConfigNeeded({ missing }: { missing: string[] }) {
  return (
    <main className="grid flex-1 place-items-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{ar.app.name} — محتاج إعداد</CardTitle>
          <CardDescription>التطبيق اتنشر، بس ناقصه متغيرات البيئة الأساسية. ضيفها في Vercel ← Project ← Settings ← Environment Variables، وبعدين اعمل Redeploy.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <ul className="grid gap-1">{missing.map((k) => <li key={k}><code dir="ltr" className="rounded bg-muted px-1.5 py-0.5">{k}</code></li>)}</ul>
          <p className="text-muted-foreground">Upstash بيتضاف من Vercel ← Storage (Marketplace) ← Upstash for Redis، وبيحط متغيراته لوحده. الشرح الكامل في README.</p>
          <p className="text-muted-foreground">عايز تشوف التطبيق ببيانات وهمية الأول؟ حط <code dir="ltr">MOCK_SHEETS=1</code> و <code dir="ltr">AUTH_DISABLED=1</code> (من غير بيانات حقيقية — وخلي Vercel Deployment Protection شغال).</p>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await connection(); // the env is read at request time, never baked in at build time
  const missing = missingConfig();
  if (missing.length) return <ConfigNeeded missing={missing} />;
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="grid flex-1 place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{ar.app.name}</CardTitle>
          <CardDescription>{ar.login.body}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {error && <p role="alert" className="text-sm text-destructive">{ar.login.denied}</p>}
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
            <Button className="w-full" size="lg">{ar.login.button}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
