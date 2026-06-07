"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Lock, Mail, Loader2, Eye, EyeOff } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login fail");
        setLoading(false);
        return;
      }

      router.push("/admin");
    } catch {
      setError("Connection error");
      setLoading(false);
    }
  }

  return (
    <div className="app-page flex items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-app-primary flex items-center justify-center shadow-[0_8px_24px_rgba(79,124,255,0.18)]">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-semibold text-app-text">Admin Panel</h1>
          <p className="text-app-text-muted mt-2">Apne account se login karein</p>
        </div>

        <form onSubmit={handleSubmit} className="surface-elevated p-6 sm:p-8 space-y-5">
          {error && (
            <div className="p-3 rounded-lg alert-error text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-app-text-secondary mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-app-text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                className="input-app pl-11"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-app-text-secondary mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-app-text-muted" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="input-app pl-11 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-muted hover:text-app-text"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Login ho raha hai...
              </>
            ) : (
              "Login"
            )}
          </button>

          <p className="text-center text-sm text-app-text-muted">
            <Link href="/" className="hover:text-app-primary transition-colors">
              ← Website par wapas jayein
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-app-text-muted mt-6">
          Password .env file se set hota hai
        </p>
      </div>
    </div>
  );
}
