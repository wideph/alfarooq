"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, GraduationCap, Lock, Mail, Loader2, Eye, EyeOff } from "lucide-react";
import { isOfficeRole } from "@/lib/office/permissions";

type DepartmentLinkChip = { id: string; label: string; url: string };

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [departmentLinks, setDepartmentLinks] = useState<DepartmentLinkChip[] | null>(null);

  useEffect(() => {
    // §N9 — department access links. The GET route needs an office session; agar
    // bina login na mile (401) to static hint dikhate hain (API auth kamzor nahi ki).
    fetch("/api/office/setup/department-links")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDepartmentLinks(Array.isArray(data) ? data : []))
      .catch(() => setDepartmentLinks([]));
  }, []);

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

      // Office staff (cashier / attestation / booking office) land on /office.
      router.push(isOfficeRole(data.admin?.role) ? "/office" : "/admin");
    } catch {
      setError("Connection error");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-600/5 via-accent-500/5 to-emerald-500/5" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
          <p className="text-slate-500 mt-2">Apne account se login karein</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 sm:p-8 space-y-5"
        >
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full pl-11 pr-12 py-3 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-semibold hover:from-primary-700 hover:to-accent-700 disabled:opacity-60 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-500/25"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Login ho raha hai...
              </>
            ) : (
              "Login"
            )}
          </button>

          <p className="text-center text-sm text-slate-400">
            <Link href="/" className="hover:text-primary-600 transition-colors">
              ← Website par wapas jayein
            </Link>
          </p>
        </form>

        {departmentLinks && departmentLinks.length > 0 ? (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {departmentLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-primary-300 hover:text-primary-600 transition-colors"
              >
                {link.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        ) : (
          departmentLinks !== null &&
          departmentLinks.length === 0 && (
            <p className="mt-6 text-center text-xs text-slate-400">
              Department links admin se hasil karein
            </p>
          )
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Password .env file se set hota hai
        </p>
      </div>
    </div>
  );
}
