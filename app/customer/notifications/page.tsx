import Link from "next/link";
import CustomerNotificationCenter from "../CustomerNotificationCenter";
import NotificationPreferences from "../NotificationPreferences";

export default function CustomerNotificationsPage() {
  return <main className="min-h-screen bg-[#f4f7fb] text-slate-950"><header className="bg-[#071a33] text-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-yellow-300">Balo Logistics</p><h1 className="text-lg font-black">Notification Center</h1></div><Link href="/customer" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold">Back to dashboard</Link></div></header><div className="mx-auto max-w-5xl px-4 py-6"><CustomerNotificationCenter/><NotificationPreferences/></div></main>;
}
