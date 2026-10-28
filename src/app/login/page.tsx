"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, user } = useAuth();
  const router = useRouter();

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
        setError("Email atau password salah. Periksa kembali, lalu coba lagi.");
      }
    } catch {
      setError("Terjadi kesalahan saat login. Periksa koneksi, lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col justify-center p-4 bg-[#F8FAFC] text-[#0F172A] border-x border-slate-200 font-sans antialiased">
      <div className="w-full max-w-sm mx-auto space-y-3">
        {/* Industrial Deep Teal Terminal Header Strip */}
        <div className="bg-[#0D5C63] text-white rounded px-3.5 py-2.5 flex items-center justify-between border border-[#083B40]">
          <div>
            <span className="font-mono text-xs font-bold tracking-wider uppercase block">
              BLP STOCK OPNAME
            </span>
            <span className="text-[11px] text-teal-200/90">
              Warehouse Inventory Terminal
            </span>
          </div>
          <span className="font-mono text-[10px] font-bold bg-white/15 border border-white/25 px-1.5 py-0.5 rounded text-white">
            v2.5
          </span>
        </div>

        <div className="bg-white rounded border border-slate-200 p-4 space-y-3.5">
          <div>
            <h1 className="text-sm font-bold text-slate-900">
              Autentikasi Operator
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Masuk untuk memulai sesi penghitungan rak gudang.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate={false}>
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Email Operator <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:border-[#0D5C63] text-sm text-slate-900 font-mono transition-colors"
                placeholder="operator@blpbeauty.com"
                required
                disabled={loading}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Kata Sandi <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 px-3 bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:border-[#0D5C63] text-sm text-slate-900 transition-colors"
                placeholder="••••••••"
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 border-l-4 border-l-[#DC2626] text-[#DC2626] px-3 py-2 rounded text-xs font-semibold"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-[#0D5C63] hover:bg-[#14727A] active:bg-[#083B40] text-white rounded font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Memverifikasi…" : "Masuk Terminal"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
