"use client";

import { PageHeader } from "@/components/layout/page-primitives";
import { pageVisuals } from "@/components/layout/icon-circle";
import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";
import type { ReactNode } from "react";

export function TranslatedPageHeader({
  titleKey,
  descriptionKey,
  visual,
  actions,
}: {
  titleKey: MessageKey;
  descriptionKey?: MessageKey;
  /** Resolve icon on the client — do not pass Lucide components from server pages. */
  visual?: keyof typeof pageVisuals;
  actions?: ReactNode;
}) {
  const t = useT();
  const look = visual ? pageVisuals[visual] : null;
  return (
    <PageHeader
      title={t(titleKey)}
      description={descriptionKey ? t(descriptionKey) : undefined}
      icon={look?.icon}
      tone={look?.tone}
      actions={actions}
    />
  );
}
