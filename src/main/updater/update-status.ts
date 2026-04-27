import { existsSync } from "node:fs"
import { join } from "node:path"
import type { UpdateStatus, UpdateStatusPhase } from "../../shared/contracts/ipc"

export function hasUpdaterConfig(resourcesPath: string): boolean {
  return existsSync(join(resourcesPath, "app-update.yml"))
}

export function isUpdaterSupported(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  resourcesPath: string
): boolean {
  return isPackaged && (platform === "win32" || platform === "darwin") && hasUpdaterConfig(resourcesPath)
}

export function createUpdateStatus(
  currentVersion: string,
  phase: UpdateStatusPhase,
  patch: Partial<Omit<UpdateStatus, "currentVersion" | "phase">> = {}
): UpdateStatus {
  return {
    phase,
    currentVersion,
    availableVersion: patch.availableVersion ?? null,
    progressPercent: patch.progressPercent ?? null,
    message: patch.message ?? null,
  }
}

export function normalizeVersion(version: string | null | undefined): string | null {
  if (!version) return null
  const trimmed = version.trim()
  if (!trimmed) return null
  return trimmed.startsWith("v") || trimmed.startsWith("V") ? trimmed.slice(1) : trimmed
}
