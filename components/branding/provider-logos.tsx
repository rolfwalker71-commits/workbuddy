"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  title?: string;
};

/** Offizielle Markenfarben als SVG (nicht Lucide-Platzhalter). */

export function MicrosoftLogo({ className, title = "Microsoft" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  );
}

export function MicrosoftTeamsLogo({
  className,
  title = "Microsoft Teams",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#5059C9"
        d="M19.25 7.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5z"
      />
      <path
        fill="#5059C9"
        d="M13.5 8.25c0-.966.784-1.75 1.75-1.75h5.5c.966 0 1.75.784 1.75 1.75V14a4.5 4.5 0 0 1-4.5 4.5h-.5A4.5 4.5 0 0 1 13 14V8.25z"
      />
      <path
        fill="#7B83EB"
        d="M4.75 5.5A2.25 2.25 0 0 1 7 3.25h6.5A2.25 2.25 0 0 1 15.75 5.5v9.25a4.5 4.5 0 0 1-4.5 4.5H7a4.5 4.5 0 0 1-4.5-4.5V7.75A2.25 2.25 0 0 1 4.75 5.5z"
      />
      <path
        fill="#fff"
        d="M8.35 9.15h1.9v5.7h-1.9c-.66 0-1.2-.54-1.2-1.2v-3.3c0-.66.54-1.2 1.2-1.2z"
      />
      <path fill="#5059C9" d="M10.25 9.15h2.1v5.7h-2.1z" />
    </svg>
  );
}

export function OutlookLogo({ className, title = "Outlook" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#0078D4"
        d="M12.5 3.5h7A1.5 1.5 0 0 1 21 5v14a1.5 1.5 0 0 1-1.5 1.5h-7V3.5z"
      />
      <path
        fill="#28A8EA"
        d="M12.5 3.5v17H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5h7.5z"
      />
      <circle cx="8.25" cy="12" r="3.1" fill="#fff" />
      <path
        fill="#0078D4"
        d="M8.25 9.6c-1.32 0-2.4 1.08-2.4 2.4s1.08 2.4 2.4 2.4 2.4-1.08 2.4-2.4-1.08-2.4-2.4-2.4zm0 .9c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5z"
      />
    </svg>
  );
}

export function MicrosoftPlannerLogo({
  className,
  title = "Microsoft Planner",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect x="2" y="3" width="5.5" height="18" rx="1" fill="#31752F" />
      <rect x="9.25" y="3" width="5.5" height="12" rx="1" fill="#3FA33D" />
      <rect x="16.5" y="3" width="5.5" height="8" rx="1" fill="#6BCB6A" />
    </svg>
  );
}

/** Microsoft To Do checkmark mark. */
export function MicrosoftToDoLogo({
  className,
  title = "Microsoft To Do",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#2564CF" />
      <path
        fill="#fff"
        d="M10.2 16.2 6.6 12.6l1.4-1.4 2.2 2.2 5.4-5.4 1.4 1.4-6.8 6.8z"
      />
    </svg>
  );
}

/**
 * Maringo Support-Markenzeichen: gestreiftes „M“ aus dem Maringo-Wortbild
 * (Navy #003060) plus AI-Funke in MARIProject-Gold (#fab900).
 */
export function MaringoLogo({ className, title = "Maringo" }: LogoProps) {
  const uid = useId().replace(/:/g, "");
  const clipId = `maringo-m-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={clipId}>
          <path d="M2.8 20.5V3.5h3.9l4.3 10.6L15.3 3.5h3.9v17h-3.35V9.6L13 19.6h-2L7.15 9.6v10.9H2.8z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {[3.4, 5.6, 7.8, 10, 12.2, 14.4, 16.6, 18.8].map((y) => (
          <rect
            key={y}
            x="2"
            y={y}
            width="18"
            height="1.55"
            fill="#003060"
          />
        ))}
      </g>
      {/* AI-Akzent */}
      <path
        fill="#fab900"
        d="M19.1 1.6 19.85 3.5l1.9.75-1.9.75-.75 1.9-.75-1.9-1.9-.75 1.9-.75z"
      />
      <circle cx="17.35" cy="8.15" r="1.05" fill="#fab900" />
    </svg>
  );
}
