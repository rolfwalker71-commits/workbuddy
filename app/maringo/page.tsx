import { Suspense } from "react";
import { cookies } from "next/headers";
import { MaringoWorkspaceClient } from "@/components/maringo/maringo-workspace-client";
import { LOCALE_COOKIE, parseLocale, translate } from "@/lib/i18n";

export default async function MaringoPage() {
  const cookieStore = await cookies();
  const locale = parseLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground">
          {translate(locale, "common.loading")}
        </p>
      }
    >
      <MaringoWorkspaceClient />
    </Suspense>
  );
}
