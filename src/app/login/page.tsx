"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Field } from "@/components/ui";

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
        setError("Email atau password salah. Periksa kembali, lalu coba lagi.");
      }
    } catch {
      setError("Terjadi kesalahan saat login. Periksa koneksi, lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh flex items-center justify-center p-4 bg-ivory">
      <div className="w-full max-w-sm">
        {/* Location-band sebagai identitas aplikasi */}
        <div className="location-band mb-6" aria-hidden="true">
          <p className="location-band-code">Stock Opname</p>
          <p className="location-band-sub">Gudang BLP</p>
        </div>

        <div className="bg-paper rounded-card border border-border shadow-card p-6">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">
            Masuk Operator
          </h1>
          <p className="text-meta text-text-secondary mt-1 mb-5">
            Masuk untuk memulai penghitungan stok.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
            <Field id="login-email" label="Email Operator" required>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-touch px-3.5 bg-surface-warm border border-border rounded-input focus:bg-paper text-base2 text-text-primary transition"
                placeholder="nama@perusahaan.com"
                required
                disabled={loading}
                autoComplete="email"
                inputMode="email"
              />
            </Field>

            <Field id="login-password" label="Kata Sandi" required>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-touch px-3.5 bg-surface-warm border border-border rounded-input focus:bg-paper text-base2 text-text-primary transition"
                placeholder="••••••••"
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </Field>

            {error && (
              <div
                role="alert"
                className="bg-danger-bg border border-danger/30 text-danger px-3.5 py-2.5 rounded-input text-meta font-semibold"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-touch bg-primary text-ivory rounded-input font-bold text-base2 transition disabled:opacity-60 active:scale-[0.98] mt-1"
            >
              {loading ? "Memproses…" : "Masuk"}
            </button>
          </form>
        </div>

        <p className="text-center text-meta text-text-secondary mt-6">
          BLP Stock Opname
        </p>
      </div>
    </div>
  );
}
