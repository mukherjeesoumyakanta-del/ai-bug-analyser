"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/");
        router.refresh(); // Refresh to update session globally
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel glass-panel-glow w-full max-w-md p-8 animate-fade-in flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Welcome Back</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sign in to analyze your code.</p>
      </div>

      {registered && (
        <div className="p-3 rounded text-sm text-center" style={{ background: "rgba(40, 200, 64, 0.1)", color: "#28c840", border: "1px solid rgba(40, 200, 64, 0.2)" }}>
          Registration successful! Please sign in.
        </div>
      )}

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
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-gradient w-full mt-2 justify-center"
        >
          {loading ? <div className="spinner" /> : "Sign In"}
        </button>
      </form>

      <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
        Don't have an account? <Link href="/register" className="text-white hover:underline">Register</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-col h-screen items-center justify-center p-6 relative">
      <Link
        href="/"
        className="absolute top-6 left-6 text-sm font-medium hover:text-white transition-colors"
        style={{ color: "var(--text-secondary)" }}
      >
        &larr; Back to Home
      </Link>
      <Suspense fallback={<div className="spinner" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
