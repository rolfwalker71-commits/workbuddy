import { cn } from "@/lib/utils";

/** «Work» / «Buddy» stacked — sidebar + mobile header. */
export function WorkBuddyWordmark({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 flex-col justify-center font-black tracking-tight",
        size === "sm"
          ? "text-[0.8125rem] leading-[0.95]"
          : "text-[1.125rem] leading-[0.95]",
        className
      )}
    >
      <span>Work</span>
      <span>Buddy</span>
    </span>
  );
}
