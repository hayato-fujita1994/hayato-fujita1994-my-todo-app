import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
];

// 名前から決まった色を選び、同じユーザーは常に同じ色になるようにする
function gradientFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash + char.charCodeAt(0)) % 997;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function UserAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white shadow-sm",
        gradientFor(name),
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
