"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, Maximize2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  MARI_ANALYZE_MODULES,
  type MariAnalyzeModuleId,
} from "@/lib/mari/analyze-modules";
import type {
  MariTimelineAttachment,
  MariTimelineItem,
} from "@/lib/mari/tickets";

const MAX_VISION_IMAGES = 6;

export type TicketAnalyzeMediaItem = {
  attachment: MariTimelineAttachment;
  at: string;
  actor: string | null;
  label: string;
};

function attachmentUrl(attachmentId: number, download = false): string {
  const q = download ? "?download=1" : "";
  return `/api/maringo/attachments/${attachmentId}${q}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function filenameLooksLikeChrome(name: string): boolean {
  return /signatur|signature|logo|footer|stempel|image00[0-3]/i.test(name);
}

function looksLikeSignature(opts: {
  filename: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
}): boolean {
  if (filenameLooksLikeChrome(opts.filename)) return true;
  if (opts.bytes > 0 && opts.bytes < 2500) return true;
  const gif =
    opts.mime.includes("gif") || /\.gif$/i.test(opts.filename);
  if (gif && opts.bytes > 0 && opts.bytes < 12_000) return true;
  if (opts.width && opts.height) {
    if (opts.width <= 220 && opts.height <= 90) return true;
    if (opts.width * opts.height < 8000) return true;
  }
  return false;
}

export function collectTicketAnalyzeMedia(
  timeline: MariTimelineItem[]
): { images: TicketAnalyzeMediaItem[]; documents: TicketAnalyzeMediaItem[] } {
  const seen = new Set<number>();
  const images: TicketAnalyzeMediaItem[] = [];
  const documents: TicketAnalyzeMediaItem[] = [];
  for (const item of timeline) {
    for (const attachment of item.attachments || []) {
      if (seen.has(attachment.attachmentId)) continue;
      seen.add(attachment.attachmentId);
      const row: TicketAnalyzeMediaItem = {
        attachment,
        at: item.at,
        actor: item.actor,
        label: item.label,
      };
      if (attachment.isImage) images.push(row);
      else documents.push(row);
    }
  }
  return { images, documents };
}

function PickerImageTile({
  item,
  selected,
  disabled,
  onToggle,
  onEnlarge,
  onSignatureHint,
}: {
  item: TicketAnalyzeMediaItem;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onEnlarge: (src: string) => void;
  onSignatureHint: (likely: boolean) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(
    filenameLooksLikeChrome(item.attachment.orgFilename)
  );
  const onSignatureHintRef = useRef(onSignatureHint);
  onSignatureHintRef.current = onSignatureHint;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch(
          attachmentUrl(item.attachment.attachmentId),
          { credentials: "same-origin" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.size < 32) throw new Error("empty");
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.src = objectUrl;
        await img.decode().catch(() => undefined);
        if (cancelled) return;
        setSrc(objectUrl);
        const likely = looksLikeSignature({
          filename: item.attachment.orgFilename,
          mime: item.attachment.mimeType || blob.type,
          bytes: blob.size,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setHint(likely);
        onSignatureHintRef.current(likely);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    item.attachment.attachmentId,
    item.attachment.mimeType,
    item.attachment.orgFilename,
  ]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-foreground/10",
        selected && "ring-2 ring-primary",
        disabled && !selected && "opacity-60"
      )}
    >
      <button
        type="button"
        disabled={disabled && !selected}
        aria-pressed={selected}
        onClick={onToggle}
        className="group relative flex min-h-52 w-full items-center justify-center bg-muted p-3 text-left"
      >
        <span
          className={cn(
            "absolute left-3 top-3 z-[1] flex size-8 items-center justify-center rounded-full ring-2 ring-white shadow-sm",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground"
          )}
          aria-hidden
        >
          {selected ? <Check className="size-4" /> : null}
        </span>
        {failed ? (
          <span className="flex min-h-52 w-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
            <Paperclip className="size-5" />
            Vorschau nicht verfügbar
          </span>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={item.attachment.orgFilename}
            className="max-h-72 w-full object-contain"
          />
        ) : (
          <span className="flex min-h-52 items-center justify-center text-sm text-muted-foreground">
            Lädt…
          </span>
        )}
      </button>
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium leading-snug">
            {item.attachment.orgFilename}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.label}
            {item.actor ? ` · ${item.actor}` : ""}
            {item.at ? ` · ${formatWhen(item.at)}` : ""}
          </p>
          {hint ? (
            <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
              Wirkt wie Signatur oder Logo
            </p>
          ) : null}
        </div>
        {src ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            title="Vergrössern"
            aria-label={`${item.attachment.orgFilename} vergrössern`}
            onClick={() => onEnlarge(src)}
          >
            <Maximize2 className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export type TicketAnalyzeConfirmPayload = {
  attachmentIds: number[];
  products: MariAnalyzeModuleId[];
};

export function TicketAnalyzeAttachmentPicker({
  open,
  onOpenChange,
  timeline,
  analyzing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeline: MariTimelineItem[];
  analyzing: boolean;
  onConfirm: (payload: TicketAnalyzeConfirmPayload) => void;
}) {
  const { images, documents } = useMemo(
    () => collectTicketAnalyzeMedia(timeline),
    [timeline]
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [products, setProducts] = useState<MariAnalyzeModuleId[]>([]);
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  const [lightbox, setLightbox] = useState<{
    src: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setLightbox(null);
      return;
    }
    setTouched(new Set());
    setProducts([]);
    setSelected(
      images
        .filter((item) => !filenameLooksLikeChrome(item.attachment.orgFilename))
        .map((item) => item.attachment.attachmentId)
    );
  }, [open, images]);

  function toggleProduct(id: MariAnalyzeModuleId) {
    setProducts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggle(id: number) {
    setTouched((prev) => new Set(prev).add(id));
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_VISION_IMAGES) return prev;
      return [...prev, id];
    });
  }

  function selectLikelyScreenshots() {
    setTouched(new Set(images.map((i) => i.attachment.attachmentId)));
    setSelected(
      images
        .filter((item) => !filenameLooksLikeChrome(item.attachment.orgFilename))
        .map((item) => item.attachment.attachmentId)
        .slice(0, MAX_VISION_IMAGES)
    );
  }

  function selectAll() {
    setTouched(new Set(images.map((i) => i.attachment.attachmentId)));
    setSelected(
      images.slice(0, MAX_VISION_IMAGES).map((i) => i.attachment.attachmentId)
    );
  }

  function selectNone() {
    setTouched(new Set(images.map((i) => i.attachment.attachmentId)));
    setSelected([]);
  }

  const atCap = selected.length >= MAX_VISION_IMAGES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>AI-Analyse vorbereiten</DialogTitle>
          <DialogDescription>
            Optional Module markieren, wenn aus dem Ticket nicht klar ist,
            worum es geht. Mehrfachauswahl möglich. Ohne Auswahl sucht die
            AI wie bisher. Grafiken kannst du dazunehmen oder weglassen.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">
            Module für die Suche
            {products.length > 0 ? ` (${products.length})` : ""}
          </legend>
          <p className="text-xs text-muted-foreground">
            Gewählte Produkte gehen als Kontext an die AI (help.sap.com,
            helpdesk.coresystems.ch und passende Herstellerportale).
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MARI_ANALYZE_MODULES.map((mod) => {
              const checked = products.includes(mod.id);
              const inputId = `analyze-mod-${mod.id}`;
              return (
                <label
                  key={mod.id}
                  htmlFor={inputId}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-2xl bg-card px-3 py-2.5 shadow-sm ring-1 ring-foreground/10",
                    checked && "ring-2 ring-primary"
                  )}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-1 size-4 accent-orange-500"
                    checked={checked}
                    onChange={() => toggleProduct(mod.id)}
                  />
                  <span className="min-w-0 break-words text-sm font-medium leading-snug">
                    {mod.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {images.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Grafiken ({selected.length} von {images.length} gewählt)
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectLikelyScreenshots}
                >
                  Nur Screenshots
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                >
                  Alle
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectNone}
                >
                  Keine
                </Button>
              </div>
            </div>
            {atCap && images.length > MAX_VISION_IMAGES ? (
              <p className="text-xs text-muted-foreground">
                Höchstens {MAX_VISION_IMAGES} Grafiken gleichzeitig — zuerst
                eine abwählen, um eine andere dazuzunehmen.
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {images.map((item) => {
                const id = item.attachment.attachmentId;
                const isOn = selected.includes(id);
                return (
                  <PickerImageTile
                    key={id}
                    item={item}
                    selected={isOn}
                    disabled={!isOn && atCap}
                    onToggle={() => toggle(id)}
                    onEnlarge={(src) =>
                      setLightbox({ src, name: item.attachment.orgFilename })
                    }
                    onSignatureHint={(likely) => {
                      if (!likely || touched.has(id)) return;
                      setSelected((prev) => prev.filter((x) => x !== id));
                    }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {documents.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Dokumente ({documents.length})
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {documents.map((item) => (
                <li key={item.attachment.attachmentId}>
                  <a
                    href={attachmentUrl(item.attachment.attachmentId, true)}
                    className="flex items-start gap-3 rounded-2xl bg-muted/60 px-3 py-3 ring-1 ring-foreground/10 hover:bg-muted"
                  >
                    <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium leading-snug">
                        {item.attachment.orgFilename}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.label}
                        {item.actor ? ` · ${item.actor}` : ""}
                        {item.at ? ` · ${formatWhen(item.at)}` : ""}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={analyzing}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            className="bg-orange-500 text-white hover:bg-orange-600"
            disabled={analyzing}
            onClick={() => onConfirm({ attachmentIds: selected, products })}
          >
            {selected.length > 0
              ? `Mit ${selected.length} Grafik${selected.length === 1 ? "" : "en"} analysieren`
              : "Nur Text analysieren"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {lightbox ? (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={() => setLightbox(null)}
        >
          <div
            className="flex max-h-full max-w-full flex-col items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.src}
              alt={lightbox.name}
              className="max-h-[85vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
            />
            <p className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-foreground">
              {lightbox.name}
            </p>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
