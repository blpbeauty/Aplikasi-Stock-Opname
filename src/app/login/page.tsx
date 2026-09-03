"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, user } = useAuth();
  const router = useRouter();

  // Redirect already logged-in users to scan page
  useEffect(() => {
    if (user) {
      router.push("/scan");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        router.push("/scan");
      } else {
        setError("Email atau password salah");
      }
    } catch {
      setError("Terjadi kesalahan saat login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--primary-bg)]">
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgba(74,53,40,0.08)] border border-border p-7 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-md">
            <svg
              className="w-8 h-8 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">
            BLP Stock Opname
          </h1>
          <p className="text-text-secondary text-xs mt-1">
            Masuk untuk memulai penghitungan stok
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-text-primary mb-1">
              Email Operator
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-3 bg-surface-warm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white text-sm transition"
              placeholder="email@example.com"
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-primary mb-1">
              Kata Sandi
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-3 bg-surface-warm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white text-sm transition"
              placeholder="••••••••"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-accent-red px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-3.5 rounded-xl font-bold text-sm hover:bg-primary-light transition disabled:opacity-50 shadow-md active:scale-[0.98] mt-2"
          >
            {loading ? <LoadingSpinner /> : "Masuk ke Sistem"}
          </button>
        </form>

        <p className="text-center text-[10px] text-text-secondary mt-6">
          BLP Stock Opname · Mobile Edition
        </p>
      </div>
    </div>
  );
}
