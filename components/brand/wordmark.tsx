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
        "flex flex-col font-extrabold leading-none tracking-tight",
        size === "sm" ? "text-sm" : "text-lg",
        className
      )}
    >
      <span>Work</span>
      <span>Buddy</span>
    </span>
  );
}
