"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Loader2, LogOut } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { TodoApp } from "@/components/todo-app";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { UserLoginForm, UserSignUpForm } from "@/components/user-auth-forms";
import { createClient } from "@/lib/supabase/client";

type CurrentUser = { id: string; name: string };

// 登録時に渡した名前（user_metadata.name）を表示名の初期値にする
const fallbackName = (user: User): string =>
  user.user_metadata?.name ?? user.email ?? "ユーザー";

// Supabase 移行前に localStorage へ保存していたデータ（パスワードなしの
// ユーザー、ログイン状態、タスク）を削除する。
// Supabase のログイン情報はクッキーに保存されるので影響しない
function removeLegacyLocalData() {
  try {
    const legacyKeys = Object.keys(localStorage).filter(
      (key) =>
        key === "users" ||
        key === "currentUserId" ||
        key === "todos" ||
        key.startsWith("todos:"),
    );
    legacyKeys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage が使えない環境では何もしない
  }
}

export function TodoHome() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    removeLegacyLocalData();
  }, []);

  // ログイン状態は Supabase がクッキーに保存するので、リロードしても保たれる
  useEffect(() => {
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setLoaded(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // 表示名は profiles テーブルから取得する
  useEffect(() => {
    if (!authUser) {
      setCurrentUser(null);
      return;
    }
    setCurrentUser({ id: authUser.id, name: fallbackName(authUser) });
    let cancelled = false;
    createClient()
      .from("profiles")
      .select("name")
      .eq("id", authUser.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.name) {
          setCurrentUser({ id: authUser.id, name: data.name });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const logout = async () => {
    await createClient().auth.signOut();
    setMode("login");
  };

  return (
    <main className="relative min-h-screen flex flex-col items-center overflow-x-hidden">
      {/* 背景のぼかしグラデーション */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-violet-400/25 blur-3xl dark:bg-violet-600/20" />
        <div className="absolute top-1/3 -right-40 h-[24rem] w-[24rem] rounded-full bg-sky-300/25 blur-3xl dark:bg-indigo-600/15" />
        <div className="absolute -bottom-32 -left-32 h-[22rem] w-[22rem] rounded-full bg-fuchsia-300/20 blur-3xl dark:bg-fuchsia-700/10" />
      </div>

      <nav className="sticky top-0 z-20 w-full flex justify-center border-b border-border/60 bg-background/70 backdrop-blur-xl h-16">
        <div className="w-full max-w-5xl flex items-center gap-3 px-5">
          <div className="flex items-center gap-2.5">
            <AppLogo />
            <h1 className="text-lg font-bold tracking-tight">Todo</h1>
          </div>
          {currentUser && (
            <div className="ml-auto flex min-w-0 items-center gap-2.5">
              <UserAvatar name={currentUser.name} />
              <p className="truncate text-sm">
                <span className="hidden text-muted-foreground sm:inline">
                  ようこそ、
                </span>
                <span className="font-semibold">{currentUser.name}</span>
                <span className="text-muted-foreground">さん</span>
              </p>
            </div>
          )}
          <div className={currentUser ? undefined : "ml-auto"}>
            <ThemeSwitcher />
          </div>
          {currentUser && (
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="rounded-full text-muted-foreground"
            >
              <LogOut />
              <span className="hidden sm:inline">ログアウト</span>
              <span className="sr-only sm:hidden">ログアウト</span>
            </Button>
          )}
        </div>
      </nav>
      <div className="flex-1 w-full flex justify-center px-4 py-8 sm:px-5 sm:py-12">
        {!loaded ? (
          <Loader2
            aria-label="読み込み中"
            className="mt-20 h-6 w-6 animate-spin text-muted-foreground"
          />
        ) : currentUser ? (
          // ユーザーが変わったらタスク一覧を作り直す
          <TodoApp key={currentUser.id} userName={currentUser.name} />
        ) : mode === "login" ? (
          <UserLoginForm onShowSignUp={() => setMode("signup")} />
        ) : (
          <UserSignUpForm onShowLogin={() => setMode("login")} />
        )}
      </div>
    </main>
  );
}
