"use client";

import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";

export function AccountPageCopy({
  titleKey,
  hintKey,
  loading = false,
}: {
  titleKey?: MessageKey;
  hintKey?: MessageKey;
  loading?: boolean;
}) {
  const t = useT();
  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  return (
    <>
      {titleKey ? (
        <h2 className="text-sm font-semibold tracking-tight">{t(titleKey)}</h2>
      ) : null}
      {hintKey ? (
        <p className="text-xs text-muted-foreground">{t(hintKey)}</p>
      ) : null}
    </>
  );
}
