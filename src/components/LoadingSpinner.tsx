"use client";

import { useEffect, useState } from "react";

/**
 * Spinner tampil hanya setelah 150ms — aksi yang selesai cepat
 * tidak menampilkan spinner berkedip sesaat.
 */
export default function LoadingSpinner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}
