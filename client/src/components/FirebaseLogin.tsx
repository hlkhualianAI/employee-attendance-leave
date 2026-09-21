import { firebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";

export default function FirebaseLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (registering) {
        await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      }
    } catch (reason: unknown) {
      const code = reason instanceof Error ? reason.message : "";
      if (code.includes("auth/invalid-credential")) setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      else if (code.includes("auth/email-already-in-use")) setError("อีเมลนี้ถูกใช้งานแล้ว");
      else if (code.includes("auth/weak-password")) setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      else if (code.includes("auth/invalid-email")) setError("รูปแบบอีเมลไม่ถูกต้อง");
      else setError("เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบการเปิด Email/Password ใน Firebase");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-2xl border bg-background p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-primary">TIMEKEEP</p>
          <h1 className="text-2xl font-semibold">ระบบลงข้อมูลการเข้าทำงานของหัวเหรียญขอนแก่น</h1>
          <p className="text-sm text-muted-foreground">เข้าสู่ระบบด้วยอีเมลและรหัสผ่านของคุณ</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">อีเมล</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">รหัสผ่าน</Label>
          <Input id="password" type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={6} required value={password} onChange={event => setPassword(event.target.value)} />
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "กำลังดำเนินการ..." : registering ? "สร้างบัญชี" : "เข้าสู่ระบบ"}</Button>
        <button type="button" className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline" onClick={() => { setRegistering(value => !value); setError(""); }}>
          {registering ? "มีบัญชีแล้ว? เข้าสู่ระบบ" : "ยังไม่มีบัญชี? สร้างบัญชี"}
        </button>
      </form>
    </div>
  );
}
