import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/cn"

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "type-body flex h-10 w-full rounded-md bg-raised px-3 py-2 text-foreground",
          "transition-colors",
          "placeholder:text-subtle",
          "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
TextField.displayName = "TextField"
