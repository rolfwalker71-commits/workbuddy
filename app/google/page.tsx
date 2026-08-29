import { Suspense } from "react";
import { WorkspaceDayClient } from "@/components/workspace/workspace-day-client";
import { TranslatedLoading } from "@/components/layout/translated-loading";

export const dynamic = "force-dynamic";

export default function GooglePage() {
  return (
    <Suspense
      fallback={
        <TranslatedLoading messageKey="layout.loadingGoogle" />
      }
    >
      <WorkspaceDayClient providerScope="google" />
    </Suspense>
  );
}
