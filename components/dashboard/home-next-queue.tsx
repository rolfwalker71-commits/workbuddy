"use client";

import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Clock3,
  Inbox,
  TriangleAlert,
} from "lucide-react";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import type { HomeNextQueueItem } from "@/lib/dashboard/home-next-queue";

const ICONS = {
  "event-soon": CalendarDays,
  "ticket-overdue": TriangleAlert,
  "hours-pending": Clock3,
  "ttv-inbox": Inbox,
  "task-overdue": ClipboardList,
  "event-later": CalendarDays,
} as const;

export function HomeNextQueue({ items }: { items: HomeNextQueueItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold tracking-tight">Was als Nächstes?</h2>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex min-h-[4.5rem] items-start gap-2.5 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Icon className="size-4 text-muted-foreground" strokeWidth={APP_ICON_STROKE} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
