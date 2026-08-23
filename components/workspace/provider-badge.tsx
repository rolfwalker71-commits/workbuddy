"use client";

import {
  GmailLogo,
  GoogleLogo,
  MicrosoftLogo,
  OutlookLogo,
} from "@/components/branding/provider-logos";
import { cn } from "@/lib/utils";
import type { WorkspaceProvider } from "@/lib/workspace/merge-today";

export function ProviderBadge({
  provider,
  kind = "default",
  className,
}: {
  provider: WorkspaceProvider;
  kind?: "default" | "mail" | "calendar";
  className?: string;
}) {
  if (provider === "buddy") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-teal-800",
          className
        )}
      >
        Ritual
      </span>
    );
  }
  const Logo =
    provider === "google"
      ? kind === "mail"
        ? GmailLogo
        : GoogleLogo
      : kind === "mail"
        ? OutlookLogo
        : MicrosoftLogo;
  const label = provider === "google" ? "Google" : "Microsoft";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground",
        className
      )}
    >
      <Logo className="size-3" title={label} />
      {label}
    </span>
  );
}
