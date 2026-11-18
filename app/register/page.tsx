"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }
      
      router.push("/login?registered=true");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-20">
      <Link
        href="/"
        className="absolute top-6 left-6 text-sm font-medium hover:text-white transition-colors"
        style={{ color: "var(--text-secondary)" }}
      >
        &larr; Back to Home
      </Link>
      
      <div className="glass-panel glass-panel-glow w-full max-w-md p-5 sm:p-8 animate-fade-in flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Create an Account</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sign up to save and analyze your bugs.</p>
        </div>

        {error && (
          <div className="p-3 rounded text-sm text-center" style={{ background: "rgba(255, 95, 87, 0.1)", color: "#ff5f57", border: "1px solid rgba(255, 95, 87, 0.2)" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-transparent border rounded-lg p-2.5 text-sm text-white focus:outline-none"
              style={{ borderColor: "var(--border-glass)", outlineColor: "var(--accent-start)" }}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-transparent border rounded-lg p-2.5 text-sm text-white focus:outline-none"
              style={{ borderColor: "var(--border-glass)", outlineColor: "var(--accent-mid)" }}
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-gradient w-full mt-2 justify-center"
          >
            {loading ? <div className="spinner" /> : <span>Register</span>}
          </button>
        </form>

        <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Already have an account? <Link href="/login" className="text-white hover:underline">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
