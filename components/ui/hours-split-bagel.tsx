"use client";

import { useId } from "react";
import { BagelHoleLabel } from "@/components/ui/bagel-hole-label";
import {
  HOURS_BAGEL_BILLABLE,
  HOURS_BAGEL_EMPTY,
  HOURS_BAGEL_WORKED,
} from "@/lib/mari/donut-colors";
import {
  bagelHoursAriaLabel,
  formatBagelBillablePercent,
} from "@/lib/mari/time-book-hours";
import { cn } from "@/lib/utils";

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number
): string {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const oStart = polar(cx, cy, rOuter, endAngle);
  const oEnd = polar(cx, cy, rOuter, startAngle);
  const iStart = polar(cx, cy, rInner, startAngle);
  const iEnd = polar(cx, cy, rInner, endAngle);
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 0 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${rInner} ${rInner} 0 ${large} 1 ${iEnd.x} ${iEnd.y}`,
    "Z",
  ].join(" ");
}

const BAGEL_VIEW = 64;

const SIZE_CLASS = {
  sm: "size-10",
  md: "size-16",
  lg: "size-[4.75rem]",
} as const;

const LABEL_CLASS = {
  sm: "text-[0.625rem]",
  md: "text-xs",
  lg: "text-sm",
} as const;

export function HoursSplitBagel({
  worked,
  billable,
  size = "sm",
  className,
}: {
  worked: number;
  billable: number;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const gradId = useId();
  const cx = BAGEL_VIEW / 2;
  const cy = BAGEL_VIEW / 2;
  const rOuter = BAGEL_VIEW / 2 - 1;
  const rInner = rOuter * 0.58;
  const rMid = (rOuter + rInner) / 2;
  const strokeWidth = rOuter - rInner;
  const ariaLabel = bagelHoursAriaLabel(worked, billable);
  const percentLabel = formatBagelBillablePercent(worked, billable);
  const share =
    worked > 0 && Number.isFinite(worked) && Number.isFinite(billable)
      ? billable / worked
      : null;

  let ringColor = HOURS_BAGEL_EMPTY;
  let greenSweep = 0;
  if (worked <= 0 && billable > 0) {
    ringColor = HOURS_BAGEL_BILLABLE;
  } else if (worked > 0 && (share == null || share <= 0)) {
    ringColor = HOURS_BAGEL_WORKED;
  } else if (share != null && share >= 1) {
    ringColor = HOURS_BAGEL_BILLABLE;
  } else if (share != null && share > 0) {
    ringColor = HOURS_BAGEL_WORKED;
    greenSweep = share * 360;
  }

  return (
    <div className={cn("relative shrink-0", SIZE_CLASS[size], className)}>
      <svg
        viewBox={`0 0 ${BAGEL_VIEW} ${BAGEL_VIEW}`}
        className="block size-full"
        role="img"
        aria-label={ariaLabel}
      >
        {greenSweep > 0 ? (
          <defs>
            <filter id={`${gradId}-soft`} x="-8%" y="-8%" width="116%" height="116%">
              <feDropShadow
                dx="0"
                dy="1"
                stdDeviation="1"
                floodColor="#0f172a"
                floodOpacity="0.1"
              />
            </filter>
          </defs>
        ) : null}
        <circle
          cx={cx}
          cy={cy}
          r={rMid}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
        />
        {greenSweep > 0 ? (
          <path
            d={describeDonutSlice(cx, cy, rOuter, rInner, 0, greenSweep)}
            fill={HOURS_BAGEL_BILLABLE}
            filter={`url(#${gradId}-soft)`}
          />
        ) : null}
      </svg>
      <BagelHoleLabel>
        {percentLabel === "—" ? (
          <span
            className={cn(
              "font-black leading-none text-muted-foreground",
              LABEL_CLASS[size]
            )}
          >
            —
          </span>
        ) : (
          <span
            className={cn(
              "whitespace-nowrap font-black tabular-nums tracking-tight",
              LABEL_CLASS[size]
            )}
          >
            {percentLabel.slice(0, -1)}
            <span className="text-[0.72em] font-extrabold">%</span>
          </span>
        )}
      </BagelHoleLabel>
    </div>
  );
}
