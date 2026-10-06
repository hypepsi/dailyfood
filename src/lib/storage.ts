import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * 文件存储接口。目前写本地磁盘；以后迁到 S3/R2 只需要再实现一份并替换 `storage`。
 * key 形如 u1/2026/10/<uuid>.webp，由服务端生成，不接受用户输入。
 */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

class LocalStorage implements Storage {
  private resolve(key: string): string {
    const root = path.join(env.dataDir, "uploads");
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }

  async read(key: string) {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

export const storage: Storage = new LocalStorage();
