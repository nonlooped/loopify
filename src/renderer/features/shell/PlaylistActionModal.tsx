import { Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/Button"
import { ModalFrame } from "@/components/ModalFrame"
import { TextField } from "@/components/TextField"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"

export type PlaylistActionState =
  | { kind: "create" }
  | { kind: "rename"; id: string; currentName: string }
  | { kind: "delete"; id: string; name: string }

interface PlaylistActionModalProps {
  state: PlaylistActionState | null
  onDismiss: () => void
  onSubmitCreate: (name: string) => void
  onSubmitRename: (id: string, name: string) => void
  onSubmitDelete: (id: string) => void
}

export function PlaylistActionModal({
  state,
  onDismiss,
  onSubmitCreate,
  onSubmitRename,
  onSubmitDelete,
}: PlaylistActionModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(state != null)
  const [renderState, setRenderState] = useState<PlaylistActionState | null>(null)

  useEffect(() => {
    if (state) setRenderState(state)
  }, [state])

  useEffect(() => {
    if (shouldRender) return
    setRenderState(null)
  }, [shouldRender])

  // Global ESC handler
  useEffect(() => {
    if (!state) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [state, onDismiss])

  // Backdrop click handler
  useEffect(() => {
    if (!state) return
    const handleClick = (e: MouseEvent) => {
      if (e.target === backdropRef.current) onDismiss()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [state, onDismiss])

  if (!shouldRender || !renderState) return null

  const title =
    renderState.kind === "create"
      ? "New playlist"
      : renderState.kind === "rename"
        ? "Rename playlist"
        : "Delete playlist"
  const description =
    renderState.kind === "create"
      ? "Choose a clear name so your queue and library stay easy to scan."
      : renderState.kind === "rename"
        ? "Update the playlist label without changing its songs."
        : "This action permanently removes this playlist and cannot be undone."
  const icon =
    renderState.kind === "create" ? (
      <Plus className="h-5 w-5" />
    ) : renderState.kind === "rename" ? (
      <Pencil className="h-5 w-5" />
    ) : (
      <Trash2 className="h-5 w-5" />
    )

  return (
    <div
      ref={backdropRef}
      onTransitionEnd={onBackdropTransitionEnd}
      className={`ol-backdrop fixed inset-0 z-100 flex items-center justify-center bg-canvas/80 backdrop-blur-md ${showOverlay ? "ol-open" : ""}`}
    >
      <div>
        <ModalFrame
          title={title}
          description={description}
          icon={icon}
          onClose={onDismiss}
          size="sm"
          closeLabel="Close playlist dialog"
          isOpen={showOverlay}
          panelClassName="mx-3 sm:mx-4"
        >
          {renderState.kind === "delete" ? (
            <div className="space-y-6">
              <p className="text-sm font-semibold text-muted">
                Delete <span className="text-foreground font-bold">"{renderState.name}"</span> from
                your library?
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={onDismiss} className="flex-1">
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    onSubmitDelete(renderState.id)
                    onDismiss()
                  }}
                  className="flex-1"
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                const name = formData.get("name") as string
                if (!name) return
                if (renderState.kind === "create") onSubmitCreate(name)
                if (renderState.kind === "rename") onSubmitRename(renderState.id, name)
                onDismiss()
              }}
            >
              <div className="space-y-2">
                <label htmlFor="playlist-name" className="type-label text-subtle">
                  Playlist name
                </label>
                <TextField
                  id="playlist-name"
                  name="name"
                  defaultValue={renderState.kind === "rename" ? renderState.currentName : ""}
                  placeholder="Enter a name"
                  autoFocus
                  className="h-12"
                />
              </div>
              <Button size="lg" type="submit" className="w-full mt-2">
                {renderState.kind === "create" ? "Create playlist" : "Save changes"}
              </Button>
            </form>
          )}
        </ModalFrame>
      </div>
    </div>
  )
}
