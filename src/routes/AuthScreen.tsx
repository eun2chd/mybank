import { FormEvent, useState } from "react";
import { Banknote, LogIn, UserRoundPlus } from "lucide-react";
import { AuthUser, getSavedIdentifier, setSavedIdentifier, storeUser } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  onAuthenticated: (user: AuthUser) => void;
};

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [identifier, setIdentifier] = useState(() => getSavedIdentifier());
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(() => Boolean(getSavedIdentifier()));
  const [autoLogin, setAutoLogin] = useState(true);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/simple-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "login"
          ? { identifier, password }
          : { nickname, email: email || null, password: password || undefined }
      )
    });

    const body = await response.json();
    if (!response.ok) {
      setMessage(body.message ?? "요청에 실패했습니다.");
      return;
    }

    if (mode === "login") {
      setSavedIdentifier(rememberId ? identifier : null);
    }

    storeUser(body, autoLogin);
    onAuthenticated(body);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-[460px] py-6 shadow-2xl shadow-black/40">
        <CardContent className="flex flex-col gap-5 px-7">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white">
              <Banknote size={28} />
            </div>
            <div>
              <strong className="block text-lg font-extrabold">MyBank</strong>
              <span className="text-sm text-muted-foreground">개인 계좌 관리</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
            <button
              type="button"
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-md py-2 text-sm transition-colors",
                mode === "login" ? "bg-card font-bold shadow-sm" : "text-muted-foreground"
              )}
              onClick={() => setMode("login")}
            >
              <LogIn size={16} />
              로그인
            </button>
            <button
              type="button"
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-md py-2 text-sm transition-colors",
                mode === "signup" ? "bg-card font-bold shadow-sm" : "text-muted-foreground"
              )}
              onClick={() => setMode("signup")}
            >
              <UserRoundPlus size={16} />
              간편가입
            </button>
          </div>

          <form className="flex flex-col gap-4" onSubmit={submit}>
            {mode === "login" ? (
              <div className="grid gap-2">
                <Label htmlFor="identifier">이메일 또는 닉네임</Label>
                <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="nickname">닉네임</Label>
                  <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} autoFocus />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">이메일</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "선택 입력" : "비밀번호 없는 계정은 비워두세요"}
              />
            </div>

            <div className="flex flex-col gap-2">
              {mode === "login" ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    checked={rememberId}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRememberId(checked);
                      if (!checked) setSavedIdentifier(null);
                    }}
                    type="checkbox"
                    className="size-4 accent-primary"
                  />
                  아이디 저장
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  checked={autoLogin}
                  onChange={(e) => setAutoLogin(e.target.checked)}
                  type="checkbox"
                  className="size-4 accent-primary"
                />
                자동 로그인
              </label>
            </div>

            <Button type="submit" size="lg" className="w-full">
              {mode === "login" ? "로그인" : "계정 만들기"}
            </Button>
            {message ? <p className="text-sm text-destructive">{message}</p> : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
