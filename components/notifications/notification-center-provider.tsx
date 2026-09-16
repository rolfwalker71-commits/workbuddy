"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** Wird von RealtimeToasts gefeuert, wenn eine neue Meldung eintrifft. */
export const NOTIFICATIONS_CHANGED_EVENT = "buddy:notifications-changed";

type NotificationCenterValue = {
  open: boolean;
  unread: number;
  openCenter: () => void;
  closeCenter: () => void;
  setUnread: (n: number) => void;
  refreshUnread: () => void;
};

const NotificationCenterContext = createContext<NotificationCenterValue | null>(
  null
);

export function useNotificationCenter(): NotificationCenterValue {
  const ctx = useContext(NotificationCenterContext);
  if (!ctx) {
    throw new Error(
      "useNotificationCenter must be used inside NotificationCenterProvider"
    );
  }
  return ctx;
}

export function NotificationCenterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch("/api/me/notifications/count", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: unknown };
        const n = Number(data.unread);
        if (Number.isFinite(n) && n >= 0) setUnread(n);
      } catch {
        // Der Zähler ist Komfort — ein Netzwerkfehler darf die Shell nicht stören.
      }
    })();
  }, []);

  useEffect(() => {
    refreshUnread();
    // Kein eigener EventSource: RealtimeToasts hält den einzigen Stream und
    // meldet neue Ereignisse über ein DOM-Event weiter. Zwei EventSource auf
    // dieselbe Route wären eine zweite offene SSE-Verbindung pro Tab.
    const onChanged = () => refreshUnread();
    const onFocus = () => refreshUnread();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshUnread]);

  const value = useMemo<NotificationCenterValue>(
    () => ({
      open,
      unread,
      openCenter: () => setOpen(true),
      closeCenter: () => setOpen(false),
      setUnread,
      refreshUnread,
    }),
    [open, unread, refreshUnread]
  );

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}
