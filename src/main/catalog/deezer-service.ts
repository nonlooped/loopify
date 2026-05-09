import { LRUCache } from "lru-cache"
import { z } from "zod"
import type {
  AlbumDetails,
  ArtistDiscography,
  CatalogAlbum,
  CatalogArtist,
  CatalogSearchResult,
  CatalogTrack,
} from "../../shared/types/music"
import { durationSimilarity, tokenOverlapRatio } from "../../shared/utils/string"

const BASE_URL = "https://api.deezer.com"
const REQUEST_TIMEOUT_MS = 8_000
const SEARCH_TRACK_LIMIT = 25
const SEARCH_ARTIST_LIMIT = 15
const SEARCH_ALBUM_LIMIT = 15
const ARTIST_TOP_TRACKS_LIMIT = 50
const ARTIST_ALBUMS_LIMIT = 200

const entityCache = new LRUCache<string, ArtistDiscography | AlbumDetails>({
  ttl: 30 * 60 * 1000,
  max: 500,
})

const searchCache = new LRUCache<string, CatalogSearchResult[]>({
  ttl: 2 * 60 * 1000,
  max: 100,
})

async function fetchDeezer(path: string): Promise<unknown> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Deezer API returned ${res.status}`)
  return res.json()
}

function entityKey(type: string, id: number): string {
  return `${type}:${id}`
}

type ArtworkFields = {
  cover_xl?: string
  cover_big?: string
  cover_medium?: string
}

type PictureFields = {
  picture_xl?: string
  picture_big?: string
  picture_medium?: string
}

function pickArtwork(sizes: ArtworkFields | undefined): string | null {
  if (!sizes) return null
  const xl = sizes.cover_xl ?? sizes.cover_big ?? sizes.cover_medium
  return typeof xl === "string" ? xl : null
}

function pickPicture(sizes: PictureFields | undefined): string | null {
  if (!sizes) return null
  const xl = sizes.picture_xl ?? sizes.picture_big ?? sizes.picture_medium
  return typeof xl === "string" ? xl : null
}

type DeezerTrackResponse = {
  id: number
  title: string
  duration: number
  isrc?: string
  artist?: { id: number; name: string }
  contributors?: { id: number; name: string; role: string }[]
  album?: {
    id: number
    title: string
    cover_xl?: string
    cover_big?: string
    cover_medium?: string
  }
}

const deezerArtistSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    picture_xl: z.string().optional(),
    picture_big: z.string().optional(),
    picture_medium: z.string().optional(),
    picture_small: z.string().optional(),
  })
  .passthrough()

const deezerContributorSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
  })
  .passthrough()

const deezerAlbumSummarySchema = z
  .object({
    id: z.number(),
    title: z.string(),
    cover_xl: z.string().optional(),
    cover_big: z.string().optional(),
    cover_medium: z.string().optional(),
  })
  .passthrough()

const deezerTrackSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    duration: z.number(),
    isrc: z.string().optional(),
    artist: deezerArtistSchema.optional(),
    contributors: z.array(deezerContributorSchema).optional(),
    album: deezerAlbumSummarySchema.optional(),
  })
  .passthrough()

const deezerAlbumSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    artist: deezerArtistSchema.optional(),
    cover_xl: z.string().optional(),
    cover_big: z.string().optional(),
    cover_medium: z.string().optional(),
    nb_tracks: z.number().optional(),
    record_type: z.string().optional(),
    release_date: z.string().optional(),
    tracks: z.object({ data: z.array(deezerTrackSchema) }).optional(),
  })
  .passthrough()

const deezerTrackListSchema = z
  .object({ data: z.array(deezerTrackSchema).optional() })
  .passthrough()
const deezerArtistListSchema = z
  .object({ data: z.array(deezerArtistSchema).optional() })
  .passthrough()
const deezerAlbumListSchema = z
  .object({ data: z.array(deezerAlbumSchema).optional() })
  .passthrough()

type DeezerArtistResponse = {
  id: number
  name: string
  picture_xl?: string
  picture_big?: string
  picture_medium?: string
  picture_small?: string
}

type DeezerAlbumResponse = {
  id: number
  title: string
  artist?: DeezerArtistResponse
  cover_xl?: string
  cover_big?: string
  cover_medium?: string
  nb_tracks?: number
  record_type?: string
  release_date?: string
  tracks?: { data: DeezerTrackResponse[] }
}

function parseDeezerResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new Error("Deezer API returned an unexpected response.")
  }
  return result.data
}

function mapTrack(r: DeezerTrackResponse): CatalogTrack {
  const mainArtistId = r.artist?.id
  const features: string[] = []
  if (r.contributors) {
    for (const c of r.contributors) {
      if (c.id !== mainArtistId) {
        features.push(c.name)
      }
    }
  }
  return {
    catalogProvider: "deezer",
    catalogId: String(r.id),
    title: r.title,
    artist: r.artist?.name ?? "",
    artistDeezerId: r.artist?.id,
    features,
    album: r.album?.title ?? null,
    albumDeezerId: r.album?.id,
    artworkUrl: pickArtwork(r.album),
    durationMs: (r.duration ?? 0) * 1000,
    isrc: r.isrc ?? null,
  }
}

function mapArtist(r: DeezerArtistResponse): CatalogArtist {
  return {
    deezerId: r.id,
    name: r.name,
    pictureUrl: pickPicture(r),
  }
}

function mapAlbum(r: DeezerAlbumResponse): CatalogAlbum {
  return {
    deezerId: r.id,
    title: r.title,
    artistName: r.artist?.name ?? "",
    coverUrl: pickArtwork(r),
    trackCount: r.nb_tracks ?? 0,
    albumType: r.record_type ?? "album",
  }
}

export class DeezerService {
  async searchAll(query: string): Promise<CatalogSearchResult[]> {
    const key = `search:all:${query.toLowerCase().trim()}`
    const cached = searchCache.get(key)
    if (cached) return cached

    const [tracks, artists, albums] = await Promise.allSettled([
      this.searchTracks(query),
      this.searchArtists(query),
      this.searchAlbums(query),
    ])

    const results: CatalogSearchResult[] = []

    const trackHits = tracks.status === "fulfilled" ? tracks.value : []
    for (const t of trackHits.slice(0, 5)) {
      results.push({ kind: "track", track: t })
    }

    const artistHits = artists.status === "fulfilled" ? artists.value : []
    for (const a of artistHits.slice(0, 3)) {
      results.push({ kind: "artist", artist: a })
    }

    const albumHits = albums.status === "fulfilled" ? albums.value : []
    for (const al of albumHits.slice(0, 3)) {
      results.push({ kind: "album", album: al })
    }

    searchCache.set(key, results)
    return results
  }

  async searchTracks(query: string): Promise<CatalogTrack[]> {
    const data = parseDeezerResponse(
      deezerTrackListSchema,
      await fetchDeezer(`/search/track?q=${encodeURIComponent(query)}&limit=${SEARCH_TRACK_LIMIT}`)
    )
    return (data.data ?? []).filter((r) => r.id && r.title && r.artist?.name).map(mapTrack)
  }

  async searchArtists(query: string): Promise<CatalogArtist[]> {
    const data = parseDeezerResponse(
      deezerArtistListSchema,
      await fetchDeezer(
        `/search/artist?q=${encodeURIComponent(query)}&limit=${SEARCH_ARTIST_LIMIT}`
      )
    )
    return (data.data ?? []).filter((r) => r.id && r.name).map(mapArtist)
  }

  async searchAlbums(query: string): Promise<CatalogAlbum[]> {
    const data = parseDeezerResponse(
      deezerAlbumListSchema,
      await fetchDeezer(`/search/album?q=${encodeURIComponent(query)}&limit=${SEARCH_ALBUM_LIMIT}`)
    )
    return (data.data ?? []).filter((r) => r.id && r.title).map(mapAlbum)
  }

  async getArtist(deezerId: number): Promise<ArtistDiscography> {
    const cacheKey = entityKey("artist", deezerId)
    const cached = entityCache.get(cacheKey) as ArtistDiscography | undefined
    if (cached) return cached

    const [artistData, topTracksData, albumsData] = await Promise.all([
      fetchDeezer(`/artist/${deezerId}`).then((data) =>
        parseDeezerResponse(deezerArtistSchema, data)
      ),
      fetchDeezer(`/artist/${deezerId}/top?limit=${ARTIST_TOP_TRACKS_LIMIT}`).then((data) =>
        parseDeezerResponse(deezerTrackListSchema, data)
      ),
      fetchDeezer(`/artist/${deezerId}/albums?limit=${ARTIST_ALBUMS_LIMIT}`).then((data) =>
        parseDeezerResponse(deezerAlbumListSchema, data)
      ),
    ])

    const artist = mapArtist(artistData)
    const topTracks = (topTracksData.data ?? []).map(mapTrack)

    const allAlbums = (albumsData.data ?? []).map(mapAlbum)
    const albums = allAlbums.filter((a) => a.albumType === "album")
    const singles = allAlbums.filter((a) => a.albumType === "single" || a.albumType === "ep")
    const compilations = allAlbums.filter((a) => a.albumType === "compilation")

    const result: ArtistDiscography = { artist, topTracks, albums, singles, compilations }
    entityCache.set(cacheKey, result)
    return result
  }

  async getAlbum(deezerId: number): Promise<AlbumDetails> {
    const cacheKey = entityKey("album", deezerId)
    const cached = entityCache.get(cacheKey) as AlbumDetails | undefined
    if (cached) return cached

    const albumData = parseDeezerResponse(
      deezerAlbumSchema,
      await fetchDeezer(`/album/${deezerId}`)
    )

    const album = mapAlbum(albumData)
    const tracks = (albumData.tracks?.data ?? []).map(mapTrack)

    const result: AlbumDetails = { album, tracks }
    entityCache.set(cacheKey, result)
    return result
  }

  async findBestTrackMatch(
    title: string,
    artist: string | null,
    durationMs: number | null,
    minScore: number
  ): Promise<CatalogTrack | null> {
    const q = [artist, title].filter(Boolean).join(" ").trim()
    if (q.length < 2) return null

    const hits = await this.searchTracks(q)
    if (hits.length === 0) return null

    let best: { track: CatalogTrack; score: number } | null = null
    for (const hit of hits) {
      const sc = matchScore(title, artist, durationMs, hit)
      if (sc >= minScore && (!best || sc > best.score)) {
        best = { track: hit, score: sc }
      }
    }
    return best?.track ?? null
  }
}

function matchScore(
  expectedTitle: string,
  expectedArtist: string | null,
  expectedDurationMs: number | null,
  hit: CatalogTrack
): number {
  const titleOverlap = tokenOverlapRatio(expectedTitle, hit.title)
  const artistOverlap =
    expectedArtist && hit.artist ? tokenOverlapRatio(expectedArtist, hit.artist) : 0.2
  let durationOverlap = 0.2
  if (expectedDurationMs && hit.durationMs) {
    durationOverlap = durationSimilarity(expectedDurationMs / 1000, hit.durationMs / 1000)
    if (durationOverlap === 0) durationOverlap = 0.1
  }
  return 0.55 * titleOverlap + 0.25 * artistOverlap + 0.2 * durationOverlap
}
