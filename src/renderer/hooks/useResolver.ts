import { useCallback, useState } from "react"
import type { CatalogTrack, TrackCandidate } from "src/shared/types/music"

export function useResolver() {
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  const resolve = useCallback(async (catalog: CatalogTrack): Promise<TrackCandidate | null> => {
    const id = `track:${catalog.catalogId}`
    setResolvingId(id)
    try {
      return await window.loopify.resolver.resolveCatalog(catalog)
    } catch (err) {
      console.error("Source resolution failed:", err)
      return null
    } finally {
      setResolvingId(null)
    }
  }, [])

  return { resolvingId, resolve }
}
