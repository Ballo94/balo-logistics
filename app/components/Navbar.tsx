"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-lg transition ${
      pathname === path
        ? "bg-white text-blue-700 font-semibold"
        : "hover:bg-blue-600"
    }`;

  return (
    <nav className="bg-blue-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">

        <div>
          <h1 className="text-2xl font-bold">
            Balo Logistics
          </h1>

          <p className="text-sm text-blue-100">
            Logistics Management System
          </p>
        </div>

        <div className="flex gap-3">

          <Link href="/admin" className={linkClass("/admin")}>
            Dashboard
          </Link>

          <Link href="/manage" className={linkClass("/manage")}>
            Manage
          </Link>

          <Link href="/track" className={linkClass("/track")}>
            Track
          </Link>

          <Link href="/settings" className={linkClass("/settings")}>
            Settings
          </Link>

        </div>

      </div>
    </nav>
  );
}