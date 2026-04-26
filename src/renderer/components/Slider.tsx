import { type CSSProperties, forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/cn"

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ className, style, value, max, min, defaultValue, disabled, ...props }, ref) => {
    const numMin = min !== undefined && min !== "" ? Number(min) : 0
    const numMax = max !== undefined && max !== "" ? Number(max) : 100
    const raw =
      value !== undefined && value !== ""
        ? Number(value)
        : defaultValue !== undefined && defaultValue !== ""
          ? Number(defaultValue)
          : numMin
    const pct =
      numMax > numMin ? Math.min(100, Math.max(0, ((raw - numMin) / (numMax - numMin)) * 100)) : 0
    const rangeStyle: CSSProperties & { "--range-progress"?: string } = {
      ...(typeof style === "object" && style !== null ? style : {}),
      "--range-progress": `${pct}%`,
    }
    return (
      <span
        className={cn(
          "range-control relative block h-3 w-full min-w-0",
          disabled && "opacity-50",
          className
        )}
        style={rangeStyle}
      >
        <input
          type="range"
          ref={ref}
          {...props}
          className="absolute inset-0 z-10 h-3 w-full cursor-pointer opacity-0 disabled:cursor-default"
          max={max}
          min={min}
          disabled={disabled}
          {...(value !== undefined
            ? { value }
            : defaultValue !== undefined
              ? { defaultValue }
              : {})}
        />
        <span
          aria-hidden="true"
          className="range-control-track pointer-events-none absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-[var(--color-range-track)]"
        >
          <span
            className="block h-full origin-left rounded-full bg-foreground"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </span>
        <span
          aria-hidden="true"
          className="range-control-thumb pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-[0_2px_4px_oklch(0_0_0/.2)] transition-transform duration-press ease-out-quart"
          style={{ left: "var(--range-progress)" }}
        />
      </span>
    )
  }
)
Slider.displayName = "Slider"
