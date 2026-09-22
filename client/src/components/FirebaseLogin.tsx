import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function FirebaseLogin() {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
    onError: loginError => setError(loginError.message || "เข้าสู่ระบบไม่สำเร็จ"),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    loginMutation.mutate({ identifier: identifier.trim(), pin });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-2xl border bg-background p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-primary">TIMEKEEP</p>
          <h1 className="text-2xl font-semibold">ระบบลงข้อมูลการเข้าทำงาน</h1>
          <p className="text-sm text-muted-foreground">เข้าสู่ระบบด้วยอีเมลและ PIN</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="identifier">อีเมล</Label>
          <Input id="identifier" type="email" autoComplete="email" required value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="เช่น songwit.sont@gmail.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pin">PIN</Label>
          <Input id="pin" type="password" inputMode="numeric" autoComplete="current-password" minLength={4} required value={pin} onChange={event => setPin(event.target.value)} placeholder="กรอก PIN" />
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="submit" disabled={loginMutation.isPending} className="w-full">{loginMutation.isPending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</Button>
      </form>
    </div>
  );
}
