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
    <div className="max-w-md mx-auto min-h-dvh flex flex-col justify-center p-4 bg-gradient-to-b from-[#D7F4F4] via-[#ECF9F9] to-[#F4FCFC] text-[#0D3B40] sm:border-x sm:border-[#8ADBD9]/65 font-sans antialiased">
      <div className="w-full space-y-3">
        {/* Compact Aqua Pastel mix Soft Teal Brand Card Header */}
        <div className="bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-[0_8px_20px_-6px_rgba(14,131,140,0.3)]">
          <div>
            <span className="font-semibold text-sm tracking-tight block">
              BLP Stock Opname
            </span>
            <span className="text-xs text-[#DCF7F6] block mt-0.5">
              Portal Stock Opname Gudang
            </span>
          </div>
          <span className="font-mono text-xs font-semibold bg-white/20 border border-white/25 px-2.5 py-1 rounded-full text-white">
            HP
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-[#9BE0DF]/75 shadow-card p-5 space-y-4">
          <div>
            <h1 className="text-base font-bold text-[#0D3B40]">
              Masuk Operator
            </h1>
            <p className="text-xs text-[#487277] mt-0.5 leading-relaxed">
              Masuk untuk memulai sesi penghitungan rak gudang.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate={false}>
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-[#487277] mb-1.5"
              >
                Email Operator <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20 text-sm text-[#0D3B40] placeholder:text-[#6B9498] font-mono transition-colors"
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
                className="block text-xs font-semibold text-[#487277] mb-1.5"
              >
                Kata Sandi <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20 text-sm text-[#0D3B40] placeholder:text-[#6B9498] transition-colors"
                placeholder="••••••••"
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="bg-[#FEF2F2] border border-[#DC2626]/20 border-l-4 border-l-[#DC2626] text-[#DC2626] px-3.5 py-2.5 rounded-xl text-xs font-semibold"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white rounded-xl font-semibold text-sm shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Memverifikasi…" : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
