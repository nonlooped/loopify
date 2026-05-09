export function isDownloadBusy(downloadStatus: string | null | undefined): boolean {
  return downloadStatus === "queued" || downloadStatus === "downloading"
}
