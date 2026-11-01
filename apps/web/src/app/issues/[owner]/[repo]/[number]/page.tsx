import type { Metadata } from "next";
import { Suspense } from "react";
import { IssueDossier } from "@/components/issue-dossier";

export const metadata: Metadata = {
  title: "Issue dossier · Incipit",
  description:
    "Verified GitHub facts, why it may fit you, and a checklist for getting started.",
};

// With Cache Components, route params are request-time data: they are read
// inside <Suspense> so the rest of the page can still prerender.
export default function DossierPage({
  params,
}: PageProps<"/issues/[owner]/[repo]/[number]">) {
  return (
    <Suspense
      fallback={
        <p className="min-h-screen bg-[#f8f6f0] p-10 text-sm text-[#77766d]">
          Loading…
        </p>
      }
    >
      <DossierFromParams params={params} />
    </Suspense>
  );
}

async function DossierFromParams({
  params,
}: {
  params: PageProps<"/issues/[owner]/[repo]/[number]">["params"];
}) {
  const { owner, repo, number } = await params;
  return <IssueDossier owner={owner} repo={repo} number={number} />;
}
