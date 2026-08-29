"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NotifyReason } from "@/lib/realtime/hub";
import {
  desktopNotificationsSupported,
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
} from "@/lib/realtime/desktop-notify";
import {
  mergeNotificationPrefs,
  type UserNotificationPrefs,
} from "@/lib/realtime/prefs-client";
import { useLocale, useT } from "@/components/i18n/locale-provider";
import { notifyReasonDisplayLabel } from "@/lib/i18n/display";
import type { MessageKey } from "@/lib/i18n";

type CatalogItem = {
  reason: NotifyReason;
  label: string;
  domain: "maringo" | "microsoft" | "google" | "app";
};

const DOMAIN_KEY: Record<CatalogItem["domain"], MessageKey | null> = {
  microsoft: "nav.microsoft",
  google: "nav.google",
  maringo: "nav.maringo",
  app: null,
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function bufferToBase64Url(buf: ArrayBuffer | null): string | null {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pushSubscriptionPayload(sub: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = sub.toJSON();
  const p256dh =
    json.keys?.p256dh || bufferToBase64Url(sub.getKey("p256dh"));
  const auth = json.keys?.auth || bufferToBase64Url(sub.getKey("auth"));
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("PUSH_INCOMPLETE");
  }
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

function explainPushError(
  err: unknown,
  t: (key: MessageKey, params?: Record<string, string | number | null | undefined>) => string
): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (msg === "PUSH_INCOMPLETE") return t("account.pushIncomplete");
  if (/secure|https|insecure/i.test(msg) || name === "SecurityError") {
    return t("account.pushNeedsHttps");
  }
  if (/push service|AbortError|Registration failed/i.test(msg) || name === "AbortError") {
    return t("account.pushWinHint", { msg });
  }
  if (/applicationServerKey|InvalidAccessError/i.test(msg)) {
    return t("account.vapidInvalid");
  }
  return msg || t("account.pushEnableFailed");
}

async function ensureServiceWorkerRegistration(
  t: (key: MessageKey, params?: Record<string, string | number | null | undefined>) => string
): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error(t("account.noServiceWorker"));
  }
  if (!window.isSecureContext) {
    throw new Error(t("account.noSecureContext"));
  }
  const existing = await navigator.serviceWorker.getRegistration("/");
  const reg =
    existing ||
            (await navigator.serviceWorker.register("/sw.js?v=push-close-v1", {
      scope: "/",
      updateViaCache: "none",
    }));
  // Force update so Android picks up icon/image payload handling.
  try {
    await reg.update();
  } catch {
    /* optional */
  }
  // Wait until active (Windows can race permission dialog vs SW activate)
  if (!reg.active) {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(t("account.swNotStarting"))
            ),
          15000
        )
      ),
    ]);
  }
  return (await navigator.serviceWorker.getRegistration("/")) || reg;
}

export function NotificationPrefsPanel() {
  const t = useT();
  const { locale } = useLocale();
  const [prefs, setPrefs] = useState<UserNotificationPrefs>(() =>
    mergeNotificationPrefs(null)
  );
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desktopPermission, setDesktopPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    "unknown" | "unsupported" | "off" | "on" | "busy"
  >("unknown");

  useEffect(() => {
    setDesktopPermission(getDesktopNotificationPermission());
    void (async () => {
      try {
        const res = await fetch("/api/me/notification-prefs");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || t("common.loadFailed"));
        setPrefs(mergeNotificationPrefs(data.prefs));
        setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
    void (async () => {
      try {
        if (typeof window !== "undefined" && !window.isSecureContext) {
          setPushStatus("unsupported");
          setError(t("account.pushNeedsHttpsPage"));
          // still check vapid so status text isn't misleading
        }
        const res = await fetch("/api/push/vapid-public-key");
        const data = await res.json().catch(() => ({}));
        const configured = Boolean(data.configured && data.publicKey);
        setPushConfigured(configured);
        if (typeof window !== "undefined" && !window.isSecureContext) {
          setPushStatus("unsupported");
          return;
        }
        if (
          !configured ||
          typeof window === "undefined" ||
          !("serviceWorker" in navigator) ||
          !("PushManager" in window)
        ) {
          setPushStatus(configured ? "unsupported" : "off");
          return;
        }
        await ensureServiceWorkerRegistration(t).catch(() => null);
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushStatus(sub ? "on" : "off");
      } catch {
        setPushStatus("off");
      }
    })();
  }, [t]);

  const byDomain = useMemo(() => {
    const map: Record<CatalogItem["domain"], CatalogItem[]> = {
      microsoft: [],
      google: [],
      maringo: [],
      app: [],
    };
    for (const item of catalog) {
      (map[item.domain] ||= []).push(item);
    }
    return map;
  }, [catalog]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/me/notification-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("common.saveFailed"));
      setPrefs(mergeNotificationPrefs(data.prefs));
      setMessage(t("account.notifySaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function toggleEvent(reason: NotifyReason, on: boolean) {
    setPrefs((prev) => ({
      ...prev,
      events: { ...prev.events, [reason]: on },
    }));
  }

  async function enableWebPush() {
    setPushStatus("busy");
    setError(null);
    setMessage(null);
    try {
      if (!window.isSecureContext) {
        throw new Error(t("account.pushHttpsWin"));
      }
      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyJson = await keyRes.json();
      if (!keyRes.ok || !keyJson.publicKey) {
        throw new Error(keyJson.error || t("account.vapidLoadFailed"));
      }
      const perm = await Notification.requestPermission();
      setDesktopPermission(perm);
      if (perm !== "granted") {
        throw new Error(t("account.notifyNotAllowed"));
      }

      // Windows Chromium: permission dialog can race ahead of PushManager.
      await new Promise((r) => setTimeout(r, 250));

      const reg = await ensureServiceWorkerRegistration(t);
      if (!reg.pushManager) {
        throw new Error(t("account.noPushManager"));
      }

      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        try {
          await existing.unsubscribe();
        } catch {
          /* recreate below */
        }
      }

      const applicationServerKey = urlBase64ToUint8Array(
        String(keyJson.publicKey).trim()
      );
      // Copy into a fresh ArrayBuffer-backed view (Chromium on Windows is picky).
      const keyCopy = new Uint8Array(applicationServerKey);

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyCopy,
      });
      const payload = pushSubscriptionPayload(sub);
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? `${body.error} (HTTP ${res.status})`
            : t("account.subscribeFailed", { status: res.status })
        );
      }
      const confirmed = await reg.pushManager.getSubscription();
      if (!confirmed) {
        throw new Error(t("account.subDiscarded"));
      }
      setPushStatus("on");
      setPrefs((p) => ({ ...p, desktopEnabled: true }));
      setMessage(t("account.pushActive"));
    } catch (err) {
      setPushStatus("off");
      setError(explainPushError(err, t));
    }
  }

  async function disableWebPush() {
    setPushStatus("busy");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushStatus("off");
      setMessage(t("account.pushDisabled"));
    } catch (err) {
      setPushStatus("off");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">{t("account.loadingSettings")}</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("account.notifyHint")}</p>

      <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
        <p className="text-sm font-medium text-foreground">{t("account.webPush")}</p>
        <p className="text-xs text-muted-foreground">
          {t("account.pushStatus", {
            state: !pushConfigured
              ? t("account.vapidNotReady")
              : pushStatus === "on"
                ? t("account.pushOn")
                : pushStatus === "unsupported"
                  ? window.isSecureContext === false
                    ? t("account.needsHttps")
                    : t("account.pushUnsupported")
                  : pushStatus === "busy"
                    ? "…"
                    : t("account.pushOff"),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              !prefs.enabled ||
              !pushConfigured ||
              pushStatus === "busy" ||
              pushStatus === "on" ||
              pushStatus === "unsupported"
            }
            onClick={() => void enableWebPush()}
          >
            {t("account.enablePush")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pushStatus !== "on"}
            onClick={() => void disableWebPush()}
          >
            {t("account.pushOffBtn")}
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : null}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
        <input
          id="notifEnabled"
          type="checkbox"
          className="mt-1 size-4 accent-[var(--brand-docs)]"
          checked={prefs.enabled}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, enabled: e.target.checked }))
          }
        />
        <div className="min-w-0 space-y-1">
          <Label htmlFor="notifEnabled" className="cursor-pointer">
            {t("account.liveNotifications")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("account.liveNotificationsHint")}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
        <input
          id="notifSound"
          type="checkbox"
          className="mt-1 size-4 accent-[var(--brand-docs)]"
          checked={prefs.soundEnabled}
          disabled={!prefs.enabled}
          onChange={(e) =>
            setPrefs((p) => ({ ...p, soundEnabled: e.target.checked }))
          }
        />
        <div className="min-w-0 space-y-1">
          <Label htmlFor="notifSound" className="cursor-pointer">
            {t("account.soundBling")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("account.soundHint")}
          </p>
        </div>
      </div>

      {desktopNotificationsSupported() ? (
        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3">
          <div className="flex items-start gap-3">
            <input
              id="notifDesktop"
              type="checkbox"
              className="mt-1 size-4 accent-[var(--brand-docs)]"
              checked={prefs.desktopEnabled}
              disabled={!prefs.enabled || desktopPermission === "denied"}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, desktopEnabled: e.target.checked }))
              }
            />
            <div className="min-w-0 space-y-1">
              <Label htmlFor="notifDesktop" className="cursor-pointer">
                {t("account.desktopWindows")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("account.desktopHint")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("account.browserPermission")}{" "}
                <strong>
                  {desktopPermission === "granted"
                    ? t("account.permGranted")
                    : desktopPermission === "denied"
                      ? t("account.permDenied")
                      : t("account.permDefault")}
                </strong>
              </p>
            </div>
          </div>
          {desktopPermission !== "granted" && desktopPermission !== "denied" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!prefs.enabled || saving}
              onClick={() => {
                void (async () => {
                  const perm = await requestDesktopNotificationPermission();
                  setDesktopPermission(perm);
                  if (perm === "granted") {
                    setPrefs((p) => ({ ...p, desktopEnabled: true }));
                    setMessage(t("account.desktopAllowed"));
                  } else if (perm === "denied") {
                    setError(t("account.desktopBlocked"));
                  }
                })();
              }}
            >
              {t("account.allowDesktop")}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("account.noDesktop")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="notifDuration" className="text-xs text-muted-foreground">
          {t("account.durationLabel")}
        </Label>
        <Input
          id="notifDuration"
          type="number"
          min={3}
          max={60}
          disabled={!prefs.enabled}
          className="h-8 w-20 rounded-lg text-sm"
          value={prefs.durationSec}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (!Number.isFinite(n)) return;
            setPrefs((p) => ({ ...p, durationSec: n }));
          }}
        />
        <span className="text-xs text-muted-foreground">{t("account.durationSec")}</span>
      </div>

      {(["microsoft", "google", "maringo", "app"] as const).map((domain) => {
        const items = byDomain[domain] || [];
        if (!items.length) return null;
        const domainKey = DOMAIN_KEY[domain];
        return (
          <div
            key={domain}
            className="space-y-2 rounded-xl border border-border/60 p-3"
          >
            <p className="text-sm font-medium">
              {domainKey ? t(domainKey) : "WorkBuddy"}
            </p>
            <div className="space-y-2">
              {items.map((item) => (
                <label
                  key={item.reason}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--brand-docs)]"
                    disabled={!prefs.enabled}
                    checked={prefs.events[item.reason] !== false}
                    onChange={(e) => toggleEvent(item.reason, e.target.checked)}
                  />
                  {notifyReasonDisplayLabel(item.reason, locale)}
                </label>
              ))}
            </div>
          </div>
        );
      })}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}

      <Button disabled={saving} onClick={() => void save()}>
        {saving ? t("common.saving") : t("account.saveNotifications")}
      </Button>
    </div>
  );
}
