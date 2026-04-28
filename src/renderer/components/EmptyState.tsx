import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
  align?: "center" | "left"
  density?: "regular" | "compact"
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  eyebrow,
  actions,
  align = "center",
  density = "regular",
  className,
}: EmptyStateProps) {
  const isCompact = density === "compact"
  const isLeft = align === "left"

  return (
    <section
      className={cn(
        "relative flex w-full flex-col",
        isCompact ? "py-4" : "py-12 sm:py-16 lg:py-24",
        className
      )}
    >
      <div
        className={cn(
          "relative flex",
          isCompact ? "gap-4" : "flex-col gap-6",
          isLeft ? "items-start text-left" : "items-center text-center"
        )}
      >
        {icon ? (
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-[1.35rem] border border-border bg-white/[0.045] text-foreground/84 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.07)]",
              "transition duration-500 ease-out-quart hover:scale-105 hover:text-accent hover:shadow-md cursor-default",
              isCompact ? "h-12 w-12" : "h-16 w-16"
            )}
          >
            {icon}
          </div>
        ) : null}

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            isCompact ? "gap-1.5" : "gap-2.5",
            isLeft ? "items-start" : "items-center"
          )}
        >
          {eyebrow ? <p className="type-meta m-0 text-accent">{eyebrow}</p> : null}
          <h2
            className={cn(
              "m-0 break-words text-balance text-foreground",
              isCompact ? "type-title" : "type-heading sm:text-[1.7rem]"
            )}
          >
            {title}
          </h2>
          <p
            className={cn(
              "m-0 max-w-[36ch] text-muted",
              isCompact ? "type-body-sm max-w-[32ch]" : "type-body-sm sm:text-[1rem]"
            )}
          >
            {description}
          </p>
          {actions ? (
            <div
              className={cn(
                "flex w-full flex-wrap gap-3",
                isCompact ? "mt-2" : "mt-3",
                isLeft ? "justify-start" : "justify-center"
              )}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
