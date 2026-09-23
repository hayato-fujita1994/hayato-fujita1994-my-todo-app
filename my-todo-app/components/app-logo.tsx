import { CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md shadow-violet-500/30",
        className,
      )}
    >
      <CheckCheck className="h-1/2 w-1/2" />
    </span>
  );
}
