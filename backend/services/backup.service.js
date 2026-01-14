import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

export async function createBackup() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const fileName = `backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now()}.zip`;
  const outputFile = path.join(DATA_DIR, fileName);
  await zipDirectory(DATA_DIR, outputFile);

  try {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith("backup_") && f.endsWith(".zip")).map(f => ({ name: f, time: fs.statSync(path.join(DATA_DIR, f)).mtime.getTime() })).sort((a, b) => b.time - a.time);
      if (files.length > 5) { 
          await Promise.all(files.slice(5).map(f => fsPromises.unlink(path.join(DATA_DIR, f.name))));
      }
  } catch(e) { console.error("Cleanup error", e); }
  return { file: fileName, localOnly: true };
}

function zipDirectory(source, out) {
  const archive = archiver("zip", { zlib: { level: 9 } }); const stream = fs.createWriteStream(out);
  return new Promise((resolve, reject) => { archive.glob('**/*', { cwd: source, ignore: ['*.zip'] }).on("error", err => reject(err)).pipe(stream); stream.on("close", () => resolve()); archive.finalize(); });
}
