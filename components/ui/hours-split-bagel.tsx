"use client";

import { useId } from "react";
import { BagelHoleLabel } from "@/components/ui/bagel-hole-label";
import {
  bagelHoursAriaLabel,
  formatBookHours,
} from "@/lib/mari/time-book-hours";
import { cn } from "@/lib/utils";

const WORKED_COLOR = "#64748b";
const BILLABLE_COLOR = "#047857";

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
  sm: "size-8",
  lg: "size-[3.5rem]",
} as const;

const LABEL_CLASS = {
  sm: "text-[0.5rem]",
  lg: "text-xs",
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
  const sliceTotal = worked + billable;
  const cx = BAGEL_VIEW / 2;
  const cy = BAGEL_VIEW / 2;
  const rOuter = BAGEL_VIEW / 2 - 1;
  const rInner = rOuter * 0.58;
  const ariaLabel = bagelHoursAriaLabel(worked, billable);

  return (
    <div className={cn("relative shrink-0", SIZE_CLASS[size], className)}>
      {sliceTotal <= 0 ? (
        <svg
          viewBox={`0 0 ${BAGEL_VIEW} ${BAGEL_VIEW}`}
          className="block size-full"
          role="img"
          aria-label={ariaLabel}
        >
          <circle
            cx={cx}
            cy={cy}
            r={(rOuter + rInner) / 2}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={rOuter - rInner}
          />
        </svg>
      ) : worked <= 0 || billable <= 0 ? (
        <svg
          viewBox={`0 0 ${BAGEL_VIEW} ${BAGEL_VIEW}`}
          className="block size-full"
          role="img"
          aria-label={ariaLabel}
        >
          <circle
            cx={cx}
            cy={cy}
            r={(rOuter + rInner) / 2}
            fill="none"
            stroke={worked > 0 ? WORKED_COLOR : BILLABLE_COLOR}
            strokeWidth={rOuter - rInner}
          />
        </svg>
      ) : (
        <svg
          viewBox={`0 0 ${BAGEL_VIEW} ${BAGEL_VIEW}`}
          className="block size-full"
          role="img"
          aria-label={ariaLabel}
        >
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
          <g filter={`url(#${gradId}-soft)`}>
            <path
              d={describeDonutSlice(
                cx,
                cy,
                rOuter,
                rInner,
                0,
                (worked / sliceTotal) * 360
              )}
              fill={WORKED_COLOR}
            />
            <path
              d={describeDonutSlice(
                cx,
                cy,
                rOuter,
                rInner,
                (worked / sliceTotal) * 360,
                360
              )}
              fill={BILLABLE_COLOR}
            />
          </g>
        </svg>
      )}
      <BagelHoleLabel>
        <span
          className={cn(
            "font-black tabular-nums tracking-tight",
            LABEL_CLASS[size]
          )}
        >
          {formatBookHours(worked)}
        </span>
      </BagelHoleLabel>
    </div>
  );
}
