import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "accent" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface NeonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-primary/15 text-primary border-primary/50 hover:bg-primary/25 hover:shadow-[0_0_22px_-4px_hsl(var(--primary))]",
  secondary:
    "bg-secondary/15 text-secondary border-secondary/50 hover:bg-secondary/25 hover:shadow-[0_0_22px_-4px_hsl(var(--secondary))]",
  accent:
    "bg-accent/15 text-accent border-accent/50 hover:bg-accent/25 hover:shadow-[0_0_22px_-4px_hsl(var(--accent))]",
  outline: "bg-transparent text-foreground border-white/20 hover:border-white/40 hover:bg-white/5",
  ghost: "bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-white/5",
};

const sizes: Record<Size, string> = {
  sm: "text-xs px-3 py-1.5 rounded-lg gap-1.5",
  md: "text-sm px-5 py-2.5 rounded-xl gap-2",
  lg: "text-base px-7 py-3.5 rounded-2xl gap-2.5",
};

export const NeonButton = forwardRef<HTMLButtonElement, NeonButtonProps>(
  ({ variant = "primary", size = "md", isLoading, fullWidth, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center border font-medium tracking-wide",
        "transition-all duration-200 active:scale-[0.97]",
        "disabled:opacity-45 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {isLoading && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  ),
);

NeonButton.displayName = "NeonButton";
export default NeonButton;
