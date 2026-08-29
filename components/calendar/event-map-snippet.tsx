"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { isPhysicalAgendaLocation } from "@/lib/dashboard/agenda-location";
import { APP_ICON_STROKE } from "@/lib/branding/app-icons";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

type PlaceHit = {
  label: string;
  lat: number;
  lon: number;
  mapsUrl: string;
  embedUrl: string;
};

export function EventMapSnippet({
  location,
  className,
}: {
  location: string | null | undefined;
  className?: string;
}) {
  const t = useT();
  const [place, setPlace] = useState<PlaceHit | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = (location || "").trim();
    if (!isPhysicalAgendaLocation(q)) {
      setPlace(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);
    void fetch(`/api/calendar/place?q=${encodeURIComponent(q)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || t("calendarUi.placeNotFound"));
        if (!cancelled) setPlace(json as PlaceHit);
      })
      .catch(() => {
        if (!cancelled) {
          setPlace(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [location]);

  if (!isPhysicalAgendaLocation(location)) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <MapPin className="size-3.5" strokeWidth={APP_ICON_STROKE} />
        {t("calendarUi.map")}
      </p>
      {place ? (
        <>
          <div className="overflow-hidden rounded-xl ring-1 ring-border/60">
            <iframe
              title={t("calendarUi.mapTitle", { label: place.label })}
              src={place.embedUrl}
              className="h-44 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <a
            href={place.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {t("calendarUi.openRoute")}
            <ExternalLink className="size-3" />
          </a>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {failed ? t("calendarUi.mapNotFound") : t("calendarUi.loadingMap")}
        </p>
      )}
    </div>
  );
}
