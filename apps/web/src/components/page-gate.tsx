import type { ComponentType } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"

type IconComponent = ComponentType<{ className?: string }>

type GateAction = {
  label: string
  /** Internal route. If set, `href` is ignored. */
  to?: string
  /** External link target. Use only when `to` is not provided. */
  href?: string
  icon?: IconComponent
}

export type PageGateProps = {
  /** Short monospaced label above the title (e.g. "Sign in", "Voice channel"). */
  eyebrow?: string
  title: string
  description?: string
  primary: GateAction
  secondary?: GateAction
}

function ActionButton(props: {
  action: GateAction
  variant?: "default" | "outline"
}) {
  const Icon = props.action.icon
  const content = (
    <>
      {props.action.label}
      {Icon ? <Icon data-icon="inline-end" /> : null}
    </>
  )
  const className = "w-full sm:w-auto"

  if (props.action.to) {
    return (
      <Button asChild size="lg" variant={props.variant} className={className}>
        <Link to={props.action.to}>{content}</Link>
      </Button>
    )
  }

  return (
    <Button asChild size="lg" variant={props.variant} className={className}>
      <a href={props.action.href}>{content}</a>
    </Button>
  )
}

/**
 * Centered empty/gate state used when a page can't show its primary content
 * yet (e.g. signed-out, missing voice channel, fetch failed). Matches the
 * signed-out `/login` layout so dead-ends feel intentional instead of broken.
 */
export function PageGate(props: PageGateProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div className="flex min-h-[min(70vh,calc(100svh-12rem))] flex-col items-center justify-center px-1">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={reduceMotion ? undefined : { opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md text-center"
      >
        {props.eyebrow ? <p className="eyebrow">{props.eyebrow}</p> : null}
        <h1 className="section-display mt-4 text-balance">{props.title}</h1>
        {props.description ? (
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {props.description}
          </p>
        ) : null}

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
          <ActionButton action={props.primary} />
          {props.secondary ? (
            <ActionButton action={props.secondary} variant="outline" />
          ) : null}
        </div>
      </motion.div>
    </div>
  )
}
