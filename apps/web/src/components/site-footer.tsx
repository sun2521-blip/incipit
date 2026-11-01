export function SiteFooter() {
  return (
    <footer className="border-t border-[#e5e0d5]">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-[#6b6a61] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="font-black tracking-[-0.06em] text-[#24251f]">
          incipit
          <span aria-hidden="true" className="text-[#bd593b]">
            .
          </span>
        </span>

        <span>Every contribution has a beginning.</span>
        <span>Built for the curious, not just the experienced.</span>
      </div>
    </footer>
  );
}
