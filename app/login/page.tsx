import { redirect } from "next/navigation";
import { ar } from "@/content/ar";
import { signIn } from "@/lib/auth/auth";
import { currentUser } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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
