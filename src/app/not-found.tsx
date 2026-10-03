import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-xl font-bold text-text-primary mb-4">
          Halaman Tidak Ditemukan
        </h2>
        <p className="text-base2 text-text-secondary mb-6">
          Maaf, halaman yang Anda cari tidak ada.
        </p>
        <Link
          href="/scan"
          className="inline-flex items-center justify-center min-h-touch bg-primary text-ivory px-6 rounded-input font-bold hover:bg-primary-light transition"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
