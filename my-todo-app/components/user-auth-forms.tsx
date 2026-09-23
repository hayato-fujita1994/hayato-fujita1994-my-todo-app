"use client";

import { useState } from "react";
import { Loader2, LogIn, MailCheck, UserPlus } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const CARD_CLASS =
  "w-full max-w-sm self-center rounded-3xl border-border/60 bg-card/80 shadow-2xl shadow-violet-500/10 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-300";

const INPUT_CLASS =
  "h-11 rounded-xl bg-background focus-visible:ring-2 focus-visible:ring-ring/40";

const PRIMARY_BUTTON_CLASS =
  "h-11 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-md shadow-violet-500/25 hover:from-violet-600 hover:to-indigo-600";

const LINK_BUTTON_CLASS =
  "font-semibold text-primary underline-offset-4 hover:underline";

const MIN_PASSWORD_LENGTH = 6;

// Supabase のエラーメッセージ（英語）を画面表示用の日本語にする
function toJapaneseError(message: string) {
  if (message.includes("Invalid login credentials")) {
    return "メールアドレスまたはパスワードが違います";
  }
  if (message.includes("Email not confirmed")) {
    return "メールアドレスの確認が済んでいません。届いた確認メールのリンクを開いてください";
  }
  if (message.includes("User already registered")) {
    return "このメールアドレスはすでに登録されています";
  }
  if (message.includes("Password should be")) {
    return `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`;
  }
  if (message.toLowerCase().includes("rate limit")) {
    return "短時間に操作が集中しました。しばらく待ってからお試しください";
  }
  return `エラーが発生しました（${message}）`;
}

function ErrorMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error}
    </p>
  );
}

export function UserLoginForm({ onShowSignUp }: { onShowSignUp: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }
    setSubmitting(true);
    setError(null);
    // 成功するとログイン状態の変化を TodoHome が受け取り、画面が切り替わる
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setError(toJapaneseError(error.message));
    setSubmitting(false);
  };

  return (
    <Card className={CARD_CLASS}>
      <CardHeader className="items-center text-center">
        <AppLogo className="mb-3 h-12 w-12 rounded-2xl" />
        <CardTitle className="text-2xl font-bold">ログイン</CardTitle>
        <CardDescription>
          メールアドレスとパスワードを入力してください
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-email">メールアドレス</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.com"
              autoComplete="email"
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-password">パスワード</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={INPUT_CLASS}
            />
          </div>
          <ErrorMessage error={error} />
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className={PRIMARY_BUTTON_CLASS}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <LogIn />}
            ログイン
          </Button>
          <p className="text-sm text-muted-foreground">
            はじめての方は{" "}
            <button
              type="button"
              onClick={onShowSignUp}
              className={LINK_BUTTON_CLASS}
            >
              新規登録
            </button>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export function UserSignUpForm({ onShowLogin }: { onShowLogin: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setError("名前を入力してください");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("正しいメールアドレスを入力してください");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`);
      return;
    }

    setSubmitting(true);
    setError(null);
    const { data, error } = await createClient().auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        // profiles テーブルの name はデータベースのトリガーがここから作る
        data: { name: trimmedName },
        emailRedirectTo: window.location.origin,
      },
    });
    setSubmitting(false);

    if (error) {
      setError(toJapaneseError(error.message));
      return;
    }
    // メール確認が有効な場合、登録済みのアドレスでもエラーにならず
    // identities が空で返ってくる
    if (data.user?.identities?.length === 0) {
      setError("このメールアドレスはすでに登録されています");
      return;
    }
    // メール確認が無効ならこの時点でログイン済みになり、TodoHome が画面を切り替える。
    // 有効ならセッションがないので、確認メールの案内を出す
    if (!data.session) setSentTo(trimmedEmail);
  };

  if (sentTo) {
    return (
      <Card className={CARD_CLASS}>
        <CardHeader className="items-center text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <MailCheck className="h-6 w-6" />
          </span>
          <CardTitle className="text-2xl font-bold">
            確認メールを送信しました
          </CardTitle>
          <CardDescription>
            {sentTo}{" "}
            に届いたメールのリンクを開くと、登録が完了してログインできます。
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl"
            onClick={onShowLogin}
          >
            ログイン画面へ
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className={CARD_CLASS}>
      <CardHeader className="items-center text-center">
        <AppLogo className="mb-3 h-12 w-12 rounded-2xl" />
        <CardTitle className="text-2xl font-bold">新規登録</CardTitle>
        <CardDescription>
          名前・メールアドレス・パスワードを入力してください
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-name">名前</Label>
            <Input
              id="signup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：鈴木一郎"
              autoComplete="name"
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-email">メールアドレス</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例：suzuki@example.com"
              autoComplete="email"
              className={INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="signup-password">パスワード</Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`${MIN_PASSWORD_LENGTH}文字以上`}
              autoComplete="new-password"
              className={INPUT_CLASS}
            />
          </div>
          <ErrorMessage error={error} />
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            className={PRIMARY_BUTTON_CLASS}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            新規登録
          </Button>
          <p className="text-sm text-muted-foreground">
            登録済みの方は{" "}
            <button
              type="button"
              onClick={onShowLogin}
              className={LINK_BUTTON_CLASS}
            >
              ログイン
            </button>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
