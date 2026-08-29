"use client";

import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";

export function TranslatedLoading({
  messageKey = "common.loading",
  className = "p-6 text-sm text-muted-foreground",
}: {
  messageKey?: MessageKey;
  className?: string;
}) {
  const t = useT();
  return <p className={className}>{t(messageKey)}</p>;
}
