import { type ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/cn"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "outline"
  size?: "sm" | "md" | "lg"
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center font-medium tracking-[0.01em] transition-[colors,transform] duration-ui ease-out-quart active:scale-[0.95] motion-reduce:active:scale-100",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:pointer-events-none disabled:opacity-45",
          variant === "primary" &&
            "bg-accent text-on-accent hover:bg-accent-bright active:bg-accent",
          variant === "ghost" && "bg-transparent text-foreground hover:bg-white/5",
          variant === "outline" &&
            "bg-transparent text-foreground border border-border hover:bg-white/5",
          variant === "danger" && "bg-danger text-on-accent hover:bg-danger/90 active:bg-danger",
          size === "sm" && "h-8 rounded px-3 text-[0.8125rem]",
          size === "md" && "h-10 rounded-md px-4 text-[0.9375rem]",
          size === "lg" && "h-12 rounded-md px-6 text-[0.9375rem]",
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
