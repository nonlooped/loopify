import { useEffect } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRightIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"

export function LoginPage() {
  const reduceMotion = useReducedMotion()
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.isSignedIn) {
      navigate("/controller", { replace: true })
    }
  }, [auth.isSignedIn, navigate])

  return (
    <div className="flex min-h-[min(70vh,calc(100svh-12rem))] flex-col items-center justify-center px-1">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={reduceMotion ? undefined : { opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md text-center"
      >
        <p className="eyebrow">Welcome</p>
        <h1 className="section-display mt-4 text-balance">
          Sign in with Discord.
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
          So the room knows it’s you, and plays the right music for the right
          people.
        </p>

        <div className="mt-10">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <a href="/auth/discord">
              Continue with Discord
              <ArrowRightIcon data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
