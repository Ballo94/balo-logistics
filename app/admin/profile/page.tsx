"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { getAdminName, getAdminRole, logout } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

export default function AdminProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (userError || !data.user) {
        router.replace("/login");
        return;
      }
      setUser(data.user);
      setLoading(false);
    });
  }, [router]);

  async function sendReset() {
    if (!user?.email) return;
    setSending(true);
    setError("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/reset-password` });
    setSending(false);
    if (resetError) setError(resetError.message);
    else setMessage("Password reset instructions have been sent to your email.");
  }

  async function signOut() {
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Unable to sign out.");
    }
  }

  if (loading || !user) return <main className="grid min-h-screen place-items-center bg-slate-100"><p className="font-semibold text-slate-500">Loading profile...</p></main>;

  const details = [
    { label: "Name", value: getAdminName(user) },
    { label: "Email", value: user.email ?? "Not available" },
    { label: "Role", value: getAdminRole(user) },
    { label: "Last login", value: user.last_sign_in_at ? new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(user.last_sign_in_at)) : "Not available" },
  ];

  return (
    <main className="min-h-screen bg-[#f3f5f8] text-slate-900">
      <header className="bg-[#071a33] text-white shadow-xl shadow-slate-950/10"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6"><Link href="/admin" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 font-black">B</span><span className="font-extrabold">Balo Logistics</span></Link><Link href="/admin" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/15">← Operations Center</Link></div></header>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">Account administration</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.04em]">Admin Profile</h1>
        <p className="mt-3 text-slate-500">Your secured Balo Logistics operator identity and account access.</p>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 bg-[#0a2d59] p-6 text-white sm:flex-row sm:items-center sm:p-8"><div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-blue-600 text-3xl font-black shadow-lg shadow-blue-950/30">{getAdminName(user).charAt(0).toUpperCase()}</div><div><p className="text-2xl font-black">{getAdminName(user)}</p><p className="mt-1 text-blue-200">{user.email}</p><span className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{getAdminRole(user)}</span></div></div>
          <dl className="grid sm:grid-cols-2">{details.map((detail) => <div key={detail.label} className="border-b border-slate-100 p-6 sm:border-r"><dt className="text-xs font-extrabold uppercase tracking-wider text-slate-400">{detail.label}</dt><dd className="mt-2 break-words font-bold text-slate-800">{detail.value}</dd></div>)}</dl>
        </section>

        {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-extrabold">Security controls</h2><p className="mt-1 text-sm text-slate-500">Reset your password or securely end this session.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void sendReset()} disabled={sending} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{sending ? "Sending..." : "Reset password"}</button><button type="button" onClick={() => void signOut()} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50">Logout</button></div></div>
      </div>
    </main>
  );
}
