"use client";

import { CalendarDays, ListTodo, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/components/i18n/locale-provider";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import {
  buildDaySummaryBriefing,
  daySummaryTextParts,
  type DaySummaryChipSource,
} from "@/lib/mail/day-summary-display";

function NameRichText({ text }: { text: string }) {
  const parts = daySummaryTextParts(text);
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

export function DaySummaryBriefing({
  text,
  clusters,
}: {
  text: string;
  clusters: DaySummaryChipSource[];
}) {
  const t = useT();
  const model = buildDaySummaryBriefing(text, clusters);
  if (!model.intro && model.bullets.length === 0) return null;

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {model.intro ? (
        <p className="text-foreground/90">
          <NameRichText text={model.intro} />
        </p>
      ) : null}
      {model.bullets.length > 0 ? (
        <ul className="space-y-2.5">
          {model.bullets.map((bullet, i) => (
            <li key={`${i}-${bullet.text.slice(0, 24)}`} className="flex gap-2">
              <span
                className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/70"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-foreground/90">
                  <NameRichText text={bullet.text} />
                </p>
                {bullet.chips.task || bullet.chips.event || bullet.chips.mail ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {bullet.chips.task ? (
                      <Badge
                        variant="secondary"
                        className="h-6 gap-1 rounded-full bg-orange-100 px-2 text-[0.625rem] font-semibold text-orange-950 dark:bg-orange-500/20 dark:text-orange-50"
                      >
                        <ListTodo
                          className="size-3"
                          strokeWidth={APP_ICON_STROKE}
                          aria-hidden
                        />
                        {t("workspace.dayChipTask")}
                      </Badge>
                    ) : null}
                    {bullet.chips.event ? (
                      <Badge
                        variant="secondary"
                        className="h-6 gap-1 rounded-full bg-sky-100 px-2 text-[0.625rem] font-semibold text-sky-950 dark:bg-sky-500/20 dark:text-sky-50"
                      >
                        <CalendarDays
                          className="size-3"
                          strokeWidth={APP_ICON_STROKE}
                          aria-hidden
                        />
                        {t("workspace.dayChipEvent")}
                      </Badge>
                    ) : null}
                    {bullet.chips.mail ? (
                      <Badge
                        variant="secondary"
                        className="h-6 gap-1 rounded-full bg-teal-100 px-2 text-[0.625rem] font-semibold text-teal-950 dark:bg-teal-500/20 dark:text-teal-50"
                      >
                        <Mail
                          className="size-3"
                          strokeWidth={APP_ICON_STROKE}
                          aria-hidden
                        />
                        {t("workspace.dayChipMail")}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
