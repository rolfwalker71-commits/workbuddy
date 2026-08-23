import {
  isMicrosoftConnected,
  hasMicrosoftTasksScope,
} from "@/lib/microsoft/oauth";
import { listOutlookTodoTasksUpcoming } from "@/lib/microsoft/mail-day-actions";
import { listMyPlannerTasks } from "@/lib/microsoft/planner";
import {
  hasGoogleTasksScope,
  isGoogleMailConnected,
} from "@/lib/google/oauth";
import { listUpcomingGoogleTasks } from "@/lib/google/tasks";

export type HomeTaskSource = "todo" | "planner" | "google";

export type HomeTaskItem = {
  key: string;
  id: string;
  source: HomeTaskSource;
  title: string;
  dueDate: string | null;
  overdue: boolean;
  subtitle: string;
  accountLabel: string;
  bucketLabel: string | null;
  href: string;
  listId: string | null;
  etag: string | null;
  planId?: string | null;
  bucketId?: string | null;
};

function zurichYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type HomeTasksBundle = {
  microsoftConnected: boolean;
  hasMicrosoftScope: boolean;
  googleConnected: boolean;
  hasGoogleScope: boolean;
  items: HomeTaskItem[];
};

export async function loadHomeTasksBundle(
  userId: number | null,
  options?: { horizonDays?: number }
): Promise<HomeTasksBundle> {
  const horizonDays = options?.horizonDays ?? 7;
  const empty: HomeTasksBundle = {
    microsoftConnected: false,
    hasMicrosoftScope: false,
    googleConnected: false,
    hasGoogleScope: false,
    items: [],
  };
  if (userId == null) return empty;

  const microsoftConnected = isMicrosoftConnected(userId);
  const hasMicrosoftScope =
    microsoftConnected && hasMicrosoftTasksScope(userId);
  const googleConnected = isGoogleMailConnected(userId);
  const hasGoogleScope = googleConnected && hasGoogleTasksScope(userId);
  const today = zurichYmd();
  const horizon = addDaysIso(today, horizonDays);

  const [todoItems, plannerItems, googleItems] = await Promise.all([
    (async () => {
      if (!hasMicrosoftScope) return [] as HomeTaskItem[];
      try {
        const items = await listOutlookTodoTasksUpcoming(userId, {
          horizonDays,
        });
        return items.map((t) => ({
          key: `todo:${t.listId}:${t.id}`,
          id: t.id,
          source: "todo" as const,
          title: t.title,
          dueDate: t.dueDate,
          overdue: t.overdue,
          subtitle: t.listTitle || "Outlook To Do",
          accountLabel: "Microsoft",
          bucketLabel: t.listTitle || "To Do",
          href: t.href,
          listId: t.listId,
          etag: null,
        }));
      } catch {
        return [] as HomeTaskItem[];
      }
    })(),
    (async () => {
      if (!hasMicrosoftScope) return [] as HomeTaskItem[];
      try {
        const items = await listMyPlannerTasks(userId, { openOnly: true });
        return items
          .filter((t) => {
            if (!t.dueDate) return true;
            return t.dueDate <= horizon;
          })
          .map((t) => {
            const plan = t.planTitle || "Planner";
            const bucket = t.bucketName || null;
            return {
              key: `planner:${t.id}`,
              id: t.id,
              source: "planner" as const,
              title: t.title,
              dueDate: t.dueDate,
              overdue: Boolean(t.dueDate && t.dueDate < today),
              subtitle: [plan, bucket].filter(Boolean).join(" · "),
              accountLabel: plan,
              bucketLabel: bucket,
              href: t.href,
              listId: null,
              etag: t.etag || null,
              planId: t.planId || null,
              bucketId: t.bucketId || null,
            };
          });
      } catch {
        return [] as HomeTaskItem[];
      }
    })(),
    (async () => {
      if (!hasGoogleScope) return [] as HomeTaskItem[];
      try {
        const items = await listUpcomingGoogleTasks(userId, { horizonDays });
        return items.map((t) => ({
          key: `google:${t.listId}:${t.id}`,
          id: t.id,
          source: "google" as const,
          title: t.title,
          dueDate: t.dueDate,
          overdue: t.overdue,
          subtitle: t.listTitle || "Google Tasks",
          accountLabel: "Google",
          bucketLabel: t.listTitle || "Tasks",
          href: t.href || "/google?tab=planner",
          listId: t.listId,
          etag: null,
        }));
      } catch {
        return [] as HomeTaskItem[];
      }
    })(),
  ]);

  const items = [...todoItems, ...plannerItems, ...googleItems].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const da = a.dueDate || "9999-99-99";
    const db = b.dueDate || "9999-99-99";
    const c = da.localeCompare(db);
    if (c !== 0) return c;
    return a.title.localeCompare(b.title, "de");
  });

  return {
    microsoftConnected,
    hasMicrosoftScope,
    googleConnected,
    hasGoogleScope,
    items,
  };
}
