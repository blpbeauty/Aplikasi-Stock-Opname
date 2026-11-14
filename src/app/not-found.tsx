import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto min-h-dvh flex items-center justify-center p-4 bg-gradient-to-b from-[#D7F4F4] via-[#ECF9F9] to-[#F4FCFC] text-[#0D3B40] sm:border-x sm:border-[#8ADBD9]/65">
      <div className="w-full bg-white rounded-2xl border border-[#9BE0DF]/75 shadow-card p-6 text-center">
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#D5F4F3] border border-[#82D6D5]/75 text-[#0B666E] font-mono text-xs font-semibold mb-3">
          Error 404
        </span>
        <h1 className="text-lg font-bold text-[#0D3B40] mb-1.5">
          Halaman Tidak Ditemukan
        </h1>
        <p className="text-sm text-[#487277] mb-5 leading-relaxed">
          Maaf, halaman yang Anda cari tidak tersedia atau sudah dipindahkan.
        </p>
        <Link
          href="/scan"
          className="w-full inline-flex items-center justify-center min-h-[48px] bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white px-6 rounded-xl font-semibold text-sm shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] transition-all duration-150 active:scale-[0.98]"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
