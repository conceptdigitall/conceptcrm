"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KeyRound, CheckCircle, ArrowLeft } from "lucide-react";

// Mesma regra do formulário de senha em Configurações.
const MIN_PASSWORD = 8;

// Chega aqui pelo link do e-mail, depois que /auth/callback criou a sessão
// de recuperação. Sem sessão (link vencido ou página aberta direto), manda
// pedir outro link.
export default function ResetPasswordPage() {
  const t = useTranslations("ResetPasswordPage");
  const router = useRouter();
  const [session, setSession] = useState<"checking" | "ok" | "missing">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setSession(data.user ? "ok" : "missing"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(t("tooShort", { min: MIN_PASSWORD }));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setError(null);
    setSaving(true);

    const { error: updateError } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(t("failed", { message: updateError.message }));
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/dashboard"), 1500);
  };

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">{children}</Card>
    </div>
  );

  if (session === "checking") {
    return shell(
      <CardHeader className="items-center text-center">
        <CardDescription className="text-muted-foreground">{t("checking")}</CardDescription>
      </CardHeader>
    );
  }

  if (session === "missing") {
    return shell(
      <>
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl text-foreground">{t("expiredTitle")}</CardTitle>
          <CardDescription className="text-muted-foreground">{t("expiredDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/forgot-password">
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {t("requestNew")}
            </Button>
          </Link>
        </CardContent>
      </>
    );
  }

  if (done) {
    return shell(
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <CheckCircle className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl text-foreground">{t("doneTitle")}</CardTitle>
        <CardDescription className="text-muted-foreground">{t("doneDesc")}</CardDescription>
      </CardHeader>
    );
  }

  return shell(
    <>
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl text-foreground">{t("title")}</CardTitle>
        <CardDescription className="text-muted-foreground">
          {t("desc", { min: MIN_PASSWORD })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-muted-foreground">
              {t("newLabel")}
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm" className="text-muted-foreground">
              {t("confirmLabel")}
            </Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20"
            />
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="mt-2 h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? t("saving") : t("save")}
          </Button>
        </form>

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToSignIn")}
        </Link>
      </CardContent>
    </>
  );
}
