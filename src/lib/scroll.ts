let pendingTimers: Array<ReturnType<typeof setTimeout>> = [];

function clearPendingTimers() {
  for (const timer of pendingTimers) {
    clearTimeout(timer);
  }
  pendingTimers = [];
}

/**
 * Fokus ke input di dalam elemen target (opsional) tanpa membatalkan animasi
 * smooth scroll, lalu menyelaraskan elemen ke tengah viewport sebelum dan
 * sesudah keyboard virtual mobile selesai terbuka.
 */
export function scrollElementCenter(
  el: HTMLElement | null | undefined,
  options?: { focusInput?: boolean; select?: boolean }
): void {
  if (!el || typeof window === "undefined") return;

  clearPendingTimers();

  const focusInput = options?.focusInput ?? false;
  const select = options?.select ?? true;

  const align = () => {
    if (!el.isConnected) return;
    el.scrollIntoView?.({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  };

  if (focusInput) {
    const input = el.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
    ) as HTMLInputElement | HTMLTextAreaElement | null;
    if (input) {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      if (select && "select" in input && typeof input.select === "function") {
        input.select();
      }
    }
  }

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(align);
  } else {
    align();
  }

  pendingTimers.push(setTimeout(align, 180));
  pendingTimers.push(setTimeout(align, 360));
}
