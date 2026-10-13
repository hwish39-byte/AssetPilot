import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

const variantClass: Record<ButtonVariant, string> = {
  primary: "border-signal-live/50 bg-signal-live/15 text-signal-live hover:bg-signal-live/20",
  secondary: "border-terminal-line bg-terminal-panel text-terminal-text hover:border-signal-live/40 hover:bg-terminal-raised",
  ghost: "border-transparent bg-transparent text-terminal-muted hover:bg-terminal-raised hover:text-terminal-text",
  danger: "border-signal-danger/45 bg-signal-danger/15 text-signal-danger hover:bg-signal-danger/20"
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "min-h-8 px-2.5 py-1.5 text-xs",
  md: "min-h-10 px-3 py-2 text-sm",
  icon: "h-8 w-8 p-0"
};

export function Button({
  children,
  className = "",
  variant = "secondary",
  size = "md",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition disabled:cursor-not-allowed disabled:border-terminal-line disabled:bg-terminal-raised/60 disabled:text-terminal-subtle focus:outline-none focus:ring-2 focus:ring-signal-live ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
