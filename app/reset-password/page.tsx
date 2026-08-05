"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setReady(Boolean(session)));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) setError(updateError.message);
    else {
      setMessage("Your password has been updated successfully.");
      setTimeout(() => router.replace("/admin"), 1200);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[#071a33] px-4 py-10"><section className="w-full max-w-md rounded-[1.5rem] bg-white p-7 shadow-2xl sm:p-9"><Link href="/login" className="text-sm font-bold text-blue-700">← Back to login</Link><p className="mt-8 text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">Account security</p><h1 className="mt-2 text-3xl font-black tracking-tight">Set a new password</h1><p className="mt-3 text-sm leading-6 text-slate-500">Choose a secure password with at least eight characters.</p>{!ready && <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">Open this page using the secure link from your password-reset email.</p>}<form onSubmit={updatePassword} className="mt-7 space-y-5"><PasswordField label="New password" value={password} onChange={setPassword} /><PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} />{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}{message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}<button type="submit" disabled={!ready || loading} className="h-13 w-full rounded-xl bg-blue-600 px-5 py-3.5 font-extrabold text-white hover:bg-blue-700 disabled:opacity-50">{loading ? "Updating password..." : "Update password"}</button></form></section></main>;
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span><input required type="password" minLength={8} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" className="h-14 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" /></label>;
}
