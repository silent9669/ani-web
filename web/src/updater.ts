import { relaunch } from "@tauri-apps/plugin-process";
import { type DownloadEvent, type Update, check } from "@tauri-apps/plugin-updater";

export type AppUpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

export type AppUpdateState = {
  status: AppUpdateStatus;
  version?: string;
  currentVersion?: string;
  notes?: string;
  progress?: number;
  message?: string;
};

export type AppUpdateProgress = {
  downloaded: number;
  total?: number;
  percent?: number;
};

export async function checkForAppUpdate() {
  return check({ timeout: 12_000 });
}

export async function downloadAndInstallAppUpdate(
  update: Update,
  onProgress: (progress: AppUpdateProgress) => void,
) {
  let downloaded = 0;
  let total: number | undefined;

  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      downloaded = 0;
      total = event.data.contentLength;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
    }

    onProgress({
      downloaded,
      total,
      percent: total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined,
    });
  });
}

export async function relaunchApp() {
  await relaunch();
}
