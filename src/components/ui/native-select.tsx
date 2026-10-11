import * as React from "react";
import { cn } from "@/lib/utils";

/** `<select>` nativo con el estilo de los inputs de shadcn (accesible y fácil de testear). */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
