import Link from "next/link";

export function SiteHeader({ saved }: { saved: number }) {
  return (
    <header className="border-b border-[#e5e0d5]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#24251f] focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" className="text-2xl font-black tracking-[-0.08em]">
          incipit
          <span aria-hidden="true" className="text-[#bd593b]">
            .
          </span>
          <span className="sr-only">, home</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-4 text-sm sm:gap-6">
          <Link href="/#discover" className="font-semibold">
            Discover
          </Link>

          <Link
            href="/#saved"
            className="text-[#6b6a61] transition hover:text-[#24251f]"
          >
            Saved ({saved})
          </Link>

          <span className="hidden rounded-full border border-[#e5e0d5] px-3 py-1 text-xs sm:inline">
            BETA
          </span>
        </nav>
      </div>
    </header>
  );
}
