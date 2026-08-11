"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    if (registering) {
      const { data, error: signupError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { account_type: "customer", full_name: name.trim() } } });
      if (signupError) setError(signupError.message); else if (!data.session) setMessage("Check your email to confirm your customer account."); else { router.replace("/customer"); router.refresh(); }
    } else {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) setError(loginError.message); else {
        const { data: profile } = await supabase.from("customer_profiles").select("user_id").eq("user_id", data.user.id).maybeSingle();
        if (!profile) { await supabase.auth.signOut(); setError("This account is not registered as a customer."); } else { router.replace("/customer"); router.refresh(); }
      }
    }
    setBusy(false);
  }

  async function resetPassword() { if (!email.trim()) { setError("Enter your email address first."); return; } const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` }); if (resetError) setError(resetError.message); else setMessage("Password reset instructions have been sent."); }

  return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-[#06172d] via-[#0b315b] to-blue-700 px-4 py-8"><section className="w-full max-w-md rounded-[1.5rem] border border-white/20 bg-white p-6 shadow-2xl sm:p-8"><Link href="/" className="flex items-center gap-2 text-sm font-black text-blue-700"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white">B</span>Balo Logistics</Link><p className="mt-7 text-[0.65rem] font-black uppercase tracking-[0.18em] text-blue-600">Customer portal</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">{registering ? "Create your account" : "Welcome back"}</h1><p className="mt-2 text-sm leading-6 text-slate-500">Access every shipment connected to your customer email.</p><form onSubmit={submit} className="mt-6 grid gap-4">{registering && <Field label="Full name" value={name} onChange={setName} autoComplete="name" />}<Field label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email"/><Field label="Password" type="password" value={password} onChange={setPassword} autoComplete={registering ? "new-password" : "current-password"}/>{error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}{message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</p>}<button disabled={busy} className="h-12 rounded-xl bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-600/20 disabled:opacity-50">{busy ? "Please wait…" : registering ? "Create customer account" : "Sign in to portal"}</button></form><button type="button" onClick={() => { setRegistering((value) => !value); setError(""); setMessage(""); }} className="mt-4 w-full text-sm font-bold text-blue-700">{registering ? "Already registered? Sign in" : "New customer? Create an account"}</button>{!registering && <button type="button" onClick={() => void resetPassword()} className="mt-3 w-full text-xs font-bold text-slate-500">Forgot your password?</button>}<p className="mt-6 border-t border-slate-100 pt-5 text-center text-xs text-slate-500">Balo administrator? <Link href="/login" className="font-bold text-blue-700">Admin login</Link></p></section></main>;
}

function Field({ label, value, onChange, type = "text", autoComplete }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete: string }) { return <label><span className="mb-1.5 block text-xs font-black text-slate-600">{label}</span><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={type === "password" ? 8 : undefined} className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"/></label>; }
