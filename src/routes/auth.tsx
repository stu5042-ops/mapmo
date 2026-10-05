import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/app";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "로그인 — 메모맵" },
      { name: "description", content: "메모맵에 로그인하고 장소에 이야기를 남기세요." },
      { property: "og:title", content: "로그인 — 메모맵" },
      { property: "og:description", content: "메모맵에 로그인하고 장소에 이야기를 남기세요." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    if (mode === "in") {
      const { error } = await api.auth.signInWithPassword({ email, password });
      if (error) setMsg("이메일 또는 비밀번호가 올바르지 않아요.");
      else nav({ to: "/" });
    } else {
      const { data, error } = await api.auth.signUp({
        email,
        password,
        options: { data: { nickname: nickname || undefined } },
      });
      if (error) setMsg(error.message);
      else if (data.session) nav({ to: "/" });
      else setMsg("회원가입에 성공했지만 세션을 만들지 못했어요. 다시 로그인해주세요.");
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-border bg-background">
        <div className="border-b border-border bg-primary p-5">
          <Link to="/" className="text-2xl font-bold">메모맵</Link>
          <div className="text-sm">{mode === "in" ? "로그인" : "회원가입"}</div>
        </div>
        <div className="space-y-3 p-5">
          {mode === "up" && (
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="닉네임" className="w-full border border-border px-3 py-2 outline-none focus:border-butter-deep" />
          )}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" className="w-full border border-border px-3 py-2 outline-none focus:border-butter-deep" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" className="w-full border border-border px-3 py-2 outline-none focus:border-butter-deep" />
          {msg && <div className="text-sm text-muted-foreground">{msg}</div>}
          <button disabled={busy} className="w-full bg-primary py-2.5 font-semibold disabled:opacity-50">
            {mode === "in" ? "로그인" : "가입하기"}
          </button>
          <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); }} className="w-full text-sm text-muted-foreground underline">
            {mode === "in" ? "계정이 없나요? 회원가입" : "이미 계정이 있나요? 로그인"}
          </button>
        </div>
      </form>
    </div>
  );
}
