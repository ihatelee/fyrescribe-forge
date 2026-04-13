import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ModalSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const ModalSelect = ({ children, className, ...props }: ModalSelectProps) => {
  return (
    <div className="relative">
      <select
        className={cn(
          "w-full appearance-none bg-fyrescribe-hover border border-border rounded-lg pl-3 pr-12 py-2 text-sm text-foreground outline-none focus:border-gold/40 disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dimmed"
      />
    </div>
  );
};

export default ModalSelect;