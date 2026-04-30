import { type ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/cn"

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg"
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "md", active, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center rounded-md transition-[colors,transform] duration-ui ease-out-quart active:scale-[0.95] motion-reduce:active:scale-100",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:pointer-events-none disabled:opacity-45",
          active ? "text-accent bg-white/5" : "text-muted hover:text-foreground hover:bg-white/5",
          size === "sm" && "h-8 w-8",
          size === "md" && "h-10 w-10",
          size === "lg" && "h-12 w-12",
          className
        )}
        {...props}
      />
    )
  }
)
IconButton.displayName = "IconButton"
