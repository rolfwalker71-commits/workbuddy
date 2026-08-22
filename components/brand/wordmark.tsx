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
        "flex flex-col justify-center font-black tracking-tight",
        size === "sm"
          ? "h-8 text-[1.05rem] leading-[0.9]"
          : "h-14 text-[1.85rem] leading-[0.9]",
        className
      )}
    >
      <span>Work</span>
      <span>Buddy</span>
    </span>
  );
}
