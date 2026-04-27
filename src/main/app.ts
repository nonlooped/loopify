import { existsSync } from "node:fs"
import { join } from "node:path"
import { is } from "@electron-toolkit/utils"
import { app, BrowserWindow, Menu } from "electron"
import { ipcChannels } from "../shared/contracts/ipc"
import { createDatabase, type DatabaseConnection } from "./db/database"
import {
  ImportRepository,
  LibraryRepository,
  LyricsCacheRepository,
  QueueRepository,
  ResolverCacheRepository,
  SettingsRepository,
} from "./db/repositories"
import { registerIpcHandlers } from "./ipc/register-handlers"
import { DownloadService } from "./library/download-service"
import { ImportService } from "./library/import-service"
import { LyricsService } from "./lyrics/lyrics-service"
import { PlayerService } from "./player/player-service"
import { DISCORD_APPLICATION_ID, DiscordPresenceService } from "./presence/discord-presence-service"
import { ResolverService } from "./resolver/resolver-service"
import { UpdaterService } from "./updater/updater-service"

let player: PlayerService | null = null
let presence: DiscordPresenceService | null = null
let dbConnection: DatabaseConnection | null = null
let queueRepository: QueueRepository | null = null

function resolveWindowIcon(): string | undefined {
  const candidates = [
    join(__dirname, "../renderer/icon.png"),
    join(process.cwd(), "src/renderer/public/icon.png"),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      return p
    }
  }
  return undefined
}

function shutdownPlayer(): void {
  queueRepository?.clear()
  queueRepository = null
  dbConnection?.close()
  dbConnection = null
  presence?.shutdown()
  presence = null
  player?.shutdown()
  player = null
}

async function createWindow(): Promise<void> {
  const windowIcon = resolveWindowIcon()
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    title: "Loopify Desktop",
    backgroundColor: "#0a0a0b",
    autoHideMenuBar: true,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  Menu.setApplicationMenu(null)
  window.setMenuBarVisibility(false)

  const db = createDatabase()
  dbConnection = db
  const settings = new SettingsRepository(db)
  const library = new LibraryRepository(db)
  const queue = new QueueRepository(db)
  queue.clear()
  queueRepository = queue
  const resolverCache = new ResolverCacheRepository(db)
  const resolver = new ResolverService(settings, resolverCache)
  const lyrics = new LyricsService(new LyricsCacheRepository(db), () => settings.get())
  player = new PlayerService(settings)
  const updater = new UpdaterService()
  presence = new DiscordPresenceService({
    applicationId: DISCORD_APPLICATION_ID,
    enabled: settings.get().discordPresenceEnabled,
  })
  const imports = new ImportService(
    new ImportRepository(db),
    library,
    resolver,
    settings,
    (job) => {
      try {
        window.webContents.send(ipcChannels.importsChanged, job)
      } catch {
        /* closed window */
      }
    }
  )
  const downloads = new DownloadService(library, settings, {
    onTrackChanged: (track) => {
      try {
        window.webContents.send(ipcChannels.downloadsChanged, track)
      } catch {
        /* closed window */
      }
    },
  })
  registerIpcHandlers({
    window,
    player,
    resolver,
    queue,
    library,
    imports,
    downloads,
    lyrics,
    settings,
    presence,
    updater,
  })

  updater.subscribe((status) => {
    try {
      window.webContents.send(ipcChannels.settingsUpdateStatusChanged, status)
    } catch {
      /* closed window */
    }
  })

  window.on("closed", shutdownPlayer)
  window.webContents.on("render-process-gone", shutdownPlayer)
  window.webContents.on(
    "did-fail-load",
    (_event, _errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
      if (isMainFrame) {
        shutdownPlayer()
      }
    }
  )

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

app.whenReady().then(createWindow)

app.on("before-quit", shutdownPlayer)

app.on("window-all-closed", () => {
  shutdownPlayer()
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

process.once("SIGINT", () => {
  shutdownPlayer()
  app.quit()
})

process.once("SIGTERM", () => {
  shutdownPlayer()
  app.quit()
})
