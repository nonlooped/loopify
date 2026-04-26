import { app } from "electron"
import { type AppUpdater, autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater"
import type { UpdateStatus } from "../../shared/contracts/ipc"
import { createUpdateStatus, isUpdaterSupported, normalizeVersion } from "./update-status"

type UpdateStatusListener = (status: UpdateStatus) => void

export class UpdaterService {
  private readonly updater: AppUpdater
  private readonly listeners = new Set<UpdateStatusListener>()
  private readonly currentVersion = app.getVersion()
  private readonly supported = isUpdaterSupported(process.platform, app.isPackaged)

  private status: UpdateStatus = this.supported
    ? createUpdateStatus(this.currentVersion, "idle")
    : createUpdateStatus(this.currentVersion, "unsupported", {
        message: app.isPackaged
          ? "Updates are only supported on the packaged Windows and macOS builds."
          : "Updates are only available in packaged builds.",
      })

  private availableVersion: string | null = null
  private checkPromise: Promise<UpdateStatus> | null = null
  private downloadPromise: Promise<UpdateStatus> | null = null

  constructor(updater: AppUpdater = autoUpdater) {
    this.updater = updater

    if (!this.supported) {
      return
    }

    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true

    this.updater.on("checking-for-update", () => {
      this.setStatus(
        createUpdateStatus(this.currentVersion, "checking", {
          availableVersion: this.availableVersion,
        })
      )
    })
    this.updater.on("update-available", (info) => {
      this.availableVersion = getReleaseVersion(info)
      this.setStatus(
        createUpdateStatus(this.currentVersion, "available", {
          availableVersion: this.availableVersion,
        })
      )
    })
    this.updater.on("update-not-available", () => {
      this.availableVersion = null
      this.setStatus(createUpdateStatus(this.currentVersion, "up-to-date"))
    })
    this.updater.on("download-progress", (progress) => {
      this.handleDownloadProgress(progress)
    })
    this.updater.on("update-downloaded", (info) => {
      this.availableVersion = getReleaseVersion(info) ?? this.availableVersion
      this.setStatus(
        createUpdateStatus(this.currentVersion, "downloaded", {
          availableVersion: this.availableVersion,
          progressPercent: 100,
        })
      )
    })
    this.updater.on("error", (error) => {
      this.setStatus(
        createUpdateStatus(this.currentVersion, "error", {
          availableVersion: this.availableVersion,
          message: error?.message ?? "The update check failed.",
        })
      )
    })
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  subscribe(listener: UpdateStatusListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!this.supported) {
      return this.status
    }
    if (this.status.phase === "downloading" || this.status.phase === "downloaded") {
      return this.status
    }
    if (this.checkPromise) {
      return this.checkPromise
    }

    this.checkPromise = this.updater
      .checkForUpdates()
      .then(() => this.status)
      .catch((error) => {
        this.setStatus(
          createUpdateStatus(this.currentVersion, "error", {
            availableVersion: this.availableVersion,
            message: error instanceof Error ? error.message : "The update check failed.",
          })
        )
        return this.status
      })
      .finally(() => {
        this.checkPromise = null
      })

    return this.checkPromise
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (!this.supported) {
      return this.status
    }
    if (this.status.phase === "downloaded" || this.status.phase === "downloading") {
      return this.downloadPromise ?? this.status
    }
    if (this.status.phase !== "available") {
      return this.status
    }
    if (this.downloadPromise) {
      return this.downloadPromise
    }

    this.setStatus(
      createUpdateStatus(this.currentVersion, "downloading", {
        availableVersion: this.availableVersion,
        progressPercent: 0,
      })
    )

    this.downloadPromise = this.updater
      .downloadUpdate()
      .then(() => this.status)
      .catch((error) => {
        this.setStatus(
          createUpdateStatus(this.currentVersion, "error", {
            availableVersion: this.availableVersion,
            message: error instanceof Error ? error.message : "The update download failed.",
          })
        )
        return this.status
      })
      .finally(() => {
        this.downloadPromise = null
      })

    return this.downloadPromise
  }

  installUpdate(): void {
    if (this.status.phase !== "downloaded") {
      return
    }
    this.updater.quitAndInstall()
  }

  private handleDownloadProgress(progress: ProgressInfo): void {
    this.setStatus(
      createUpdateStatus(this.currentVersion, "downloading", {
        availableVersion: this.availableVersion,
        progressPercent: clampPercent(progress.percent),
      })
    )
  }

  private setStatus(next: UpdateStatus): void {
    this.status = next
    for (const listener of this.listeners) {
      listener(next)
    }
  }
}

function getReleaseVersion(info: UpdateInfo): string | null {
  return normalizeVersion(info.version)
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}
