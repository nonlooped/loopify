import type { UpdateStatus, UpdateStatusPhase } from "../../shared/contracts/ipc"

export function isUpdaterSupported(platform: NodeJS.Platform, isPackaged: boolean): boolean {
  return isPackaged && (platform === "win32" || platform === "darwin")
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
