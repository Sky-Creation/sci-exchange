import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";
import { v2 as cloudinary } from "cloudinary";
import { getSettings } from "./settings.service.js";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} from "../config.js";

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");
const TEMP_DIR = path.join(__dirname, "../temp");

async function cleanupOldBackups() {
    try {
        const settings = await getSettings();
        const retentionDays = settings.backup_retention_days || 7;
        const { resources } = await cloudinary.search
            .expression('folder:backups')
            .sort_by('created_at', 'desc')
            .execute();

        if (resources.length > retentionDays) {
            const backupsToDelete = resources.slice(retentionDays);
            for (const backup of backupsToDelete) {
                await cloudinary.uploader.destroy(backup.public_id);
            }
        }
    } catch (e) {
        console.error("Backup cleanup error:", e);
    }
}

export async function createBackup() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const fileName = `backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${Date.now()}.zip`;
  const localPath = path.join(TEMP_DIR, fileName);

  await zipDirectory(DATA_DIR, localPath);

  const result = await cloudinary.uploader.upload(localPath, {
      resource_type: "raw",
      public_id: fileName,
      folder: "backups",
  });

  await fsPromises.unlink(localPath);

  await cleanupOldBackups();

  return {
      file: result.public_id,
      url: result.secure_url,
      size: result.bytes,
  };
}

function zipDirectory(source, out) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on("error", (err) => reject(err))
      .pipe(stream);

    stream.on("close", () => resolve());
    archive.finalize();
  });
}
