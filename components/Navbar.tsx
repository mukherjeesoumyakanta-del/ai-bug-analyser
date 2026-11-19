"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <header
      className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:px-6 sm:py-3 border-b animate-fade-in"
      style={{
        borderColor: "var(--border-glass)",
        background: "rgba(6, 6, 14, 0.8)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center gap-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{
              background:
                "#6659c9",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m8 2 1.88 1.88" />
              <path d="M14.12 3.88 16 2" />
              <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
              <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
              <path d="M12 20v-9" />
              <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
              <path d="M6 13H2" />
              <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
              <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
              <path d="M22 13h-4" />
              <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              AI Bug Analyser
            </h1>
            <p className="text-xs hidden sm:block" style={{ color: "var(--text-muted)" }}>
              C++ debugging workspace
            </p>
          </div>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <Link href="/collaborate" className="text-xs font-medium text-violet-300 hover:text-white">
          Debug Together
        </Link>
        {status === "loading" ? (
          <div className="w-20 h-8 rounded animate-pulse" style={{ background: "var(--glow-soft)" }} />
        ) : session?.user ? (
          <>
            {pathname === "/analytics" ? (
              <Link
                href="/"
                className="text-xs font-medium hover:text-white transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                &larr; Editor
              </Link>
            ) : (
              <Link
                href="/analytics"
                className="text-xs font-medium hover:text-white transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                Activity
              </Link>
            )}
            <span className="hidden text-xs text-white/50 lg:inline">{session.user.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-xs px-3 py-1.5 rounded border hover:bg-white/10 transition-colors"
              style={{ borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="text-xs font-medium hover:text-white transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="btn-gradient text-xs px-3 py-1.5"
            >
              Register
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
