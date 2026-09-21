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
            International logistics
          </p>
        </div>

        <div className="flex gap-3">

          <Link href="/" className={linkClass("/")}>
            Home
          </Link>

          <Link href="/track" className={linkClass("/track")}>
            Track Shipment
          </Link>

          <Link href="/#services" className={linkClass("/#services")}>
            Services
          </Link>

          <Link href="/#contact" className={linkClass("/#contact")}>
            Contact
          </Link>

        </div>

      </div>
    </nav>
  );
}
