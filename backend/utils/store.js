import fs from "fs/promises";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

class Mutex { 
    constructor() { this._lock = Promise.resolve(); } 
    lock() { 
        let unlock; 
        const next = new Promise(resolve => unlock = resolve); 
        const verify = this._lock.then(() => unlock); 
        this._lock = this._lock.then(() => next); 
        return verify; 
    } 
}

const locks = new Map();

export function getLock(filePath) { 
    if (!locks.has(filePath)) locks.set(filePath, new Mutex()); 
    return locks.get(filePath); 
}

export function initStore(filePath, defaultData = []) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); }
  if (!existsSync(filePath)) { writeFileSync(filePath, JSON.stringify(defaultData, null, 2)); }
}

export async function readJson(filePath) {
  try { 
      const data = await fs.readFile(filePath, "utf8"); 
      if (!data || data.trim() === "") return []; 
      return JSON.parse(data); 
  } catch (err) { 
      if (err.code === 'ENOENT') return []; 
      console.error(`Error reading ${filePath}:`, err); 
      return []; 
  }
}

export async function writeJson(filePath, data) {
  const unlock = await getLock(filePath).lock();
  try { 
      const tempFile = `${filePath}.tmp`; 
      await fs.writeFile(tempFile, JSON.stringify(data, null, 2)); 
      await fs.rename(tempFile, filePath); 
  } catch (err) { 
      console.error(`Error writing ${filePath}:`, err); 
      throw err; 
  } finally { 
      unlock(); 
  }
}
