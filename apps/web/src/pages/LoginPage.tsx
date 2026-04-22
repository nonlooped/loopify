import { useEffect } from "react"
import { ArrowRightIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { PageGate } from "@/components/page-gate"
import { useAuth } from "@/lib/auth"

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.isSignedIn) {
      navigate("/controller", { replace: true })
    }
  }, [auth.isSignedIn, navigate])

  return (
    <PageGate
      eyebrow="Welcome"
      title="Sign in with Discord."
      description="So the room knows it’s you, and plays the right music for the right people."
      primary={{
        label: "Continue with Discord",
        href: "/auth/discord",
        icon: ArrowRightIcon,
      }}
    />
  )
}
