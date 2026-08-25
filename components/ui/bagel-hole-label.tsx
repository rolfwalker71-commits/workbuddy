import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Label in the hole of a donut/bagel. Grid + leading-none + a small
 * downward nudge so font-black digits sit on the optical center
 * (default line boxes sit high in the ring).
 */
export function BagelHoleLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 grid place-items-center leading-none",
        className
      )}
    >
      <div className="flex translate-y-[0.12rem] flex-col items-center justify-center text-center leading-none [&>*]:leading-none">
        {children}
      </div>
    </div>
  );
}
