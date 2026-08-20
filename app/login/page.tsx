"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }
    const { data: { user }, error: verificationError } = await supabase.auth.getUser();
    setLoading(false);
    if (verificationError || !user) {
      setError(verificationError?.message ?? "Your authenticated session could not be verified.");
      return;
    }
    const destination = new URLSearchParams(window.location.search).get("next");
    const redirectTarget = destination?.startsWith("/") ? destination : "/admin";
    router.replace(redirectTarget);
    router.refresh();
  }

  async function sendPasswordReset() {
    if (!email.trim()) {
      setError("Enter your email address first, then request a password reset.");
      return;
    }
    setResetting(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (resetError) setError(resetError.message);
    else setMessage("Password reset instructions have been sent to your email.");
  }

  return (
    <main className="min-h-screen bg-[#071a33] px-4 py-10 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-black/30 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-[#0a2d59] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div aria-hidden="true" className="absolute -right-28 -top-28 h-80 w-80 rounded-full border-[70px] border-white/[0.05]" />
          <Link href="/" className="relative flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-600 text-xl font-black">B</span><span><strong className="block text-xl">Balo Logistics</strong><span className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Operations platform</span></span></Link>
          <div className="relative"><p className="text-xs font-extrabold uppercase tracking-[0.22em] text-blue-300">Secure operations</p><h1 className="mt-4 text-5xl font-black leading-[1.05] tracking-[-0.04em]">Control every shipment with confidence.</h1><p className="mt-6 max-w-md leading-7 text-blue-100/90">Access live shipment intelligence, operational analytics, customer updates, and delivery management from one protected workspace.</p></div>
          <p className="relative text-xs text-blue-200">Authorized Balo Logistics personnel only</p>
        </section>

        <section className="flex items-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="mx-auto w-full max-w-md">
            <Link href="/" className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-700 lg:hidden">← Balo Logistics</Link>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">Admin access</p>
            <h2 className="mt-2 text-4xl font-black tracking-[-0.04em] text-slate-950">Welcome back</h2>
            <p className="mt-3 text-slate-500">Sign in to your logistics operations center.</p>

            <form onSubmit={login} className="mt-9 space-y-5">
              <AuthField label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="admin@balologistics.com" />
              <AuthField label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Enter your password" />
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
              {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
              <button type="submit" disabled={loading} className="h-14 w-full rounded-xl bg-blue-600 font-extrabold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60">{loading ? "Signing in..." : "Sign in to dashboard"}</button>
            </form>

            <button type="button" onClick={() => void sendPasswordReset()} disabled={resetting} className="mt-5 w-full text-sm font-bold text-blue-700 hover:text-blue-900 disabled:opacity-50">{resetting ? "Sending reset email..." : "Forgot your password?"}</button>
            <div className="mt-9 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">Customer? <Link href="/track" className="font-bold text-blue-700 hover:underline">Track a shipment</Link></div>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuthField({ label, type, value, onChange, autoComplete, placeholder }: { label: string; type: string; value: string; onChange: (value: string) => void; autoComplete: string; placeholder: string }) {
  return <label><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder} className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-medium outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" /></label>;
}
