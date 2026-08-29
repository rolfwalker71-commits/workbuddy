"use client";

import { PageHeader } from "@/components/layout/page-primitives";
import { useT } from "@/components/i18n/locale-provider";
import type { MessageKey } from "@/lib/i18n";
import type { IconTone } from "@/components/layout/icon-circle";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function TranslatedPageHeader({
  titleKey,
  descriptionKey,
  icon,
  tone,
  actions,
}: {
  titleKey: MessageKey;
  descriptionKey?: MessageKey;
  icon?: LucideIcon;
  tone?: IconTone;
  actions?: ReactNode;
}) {
  const t = useT();
  return (
    <PageHeader
      title={t(titleKey)}
      description={descriptionKey ? t(descriptionKey) : undefined}
      icon={icon}
      tone={tone}
      actions={actions}
    />
  );
}
