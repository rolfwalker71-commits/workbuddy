"use client";

import { sanitizeMailHtml } from "@/lib/mail/mail-html-display";
import { cn } from "@/lib/utils";

/**
 * Formatted Outlook HTML: preview and edit in place.
 * Remount via `syncKey` after open / Signaturbilder entfernen so React
 * does not reset the caret on every keystroke.
 */
export function MailHtmlImportEditor({
  html,
  syncKey,
  onChange,
  labelledBy,
}: {
  html: string;
  syncKey: string;
  onChange: (nextHtml: string) => void;
  labelledBy?: string;
}) {
  return (
    <div
      key={syncKey}
      id="mail-tk-body"
      role="textbox"
      aria-multiline="true"
      aria-labelledby={labelledBy}
      contentEditable
      suppressContentEditableWarning
      className={cn(
        "mail-html-body min-h-36 max-h-[min(50vh,24rem)] overflow-y-auto overflow-x-hidden break-words rounded-lg border border-input bg-background p-3 text-sm leading-relaxed outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "[&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-h-80 [&_img]:max-w-full",
        "[&_table]:max-w-full [&_td]:align-top"
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeMailHtml(html) }}
      onInput={(e) => {
        onChange(e.currentTarget.innerHTML);
      }}
    />
  );
}
