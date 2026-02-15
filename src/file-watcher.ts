import { createList, type List } from "@zeix/cause-effect";
import { Glob } from "bun";
import { createHash } from "crypto";
import { existsSync, watch } from "fs";
import { stat } from "fs/promises";
import { basename, join } from "path";

export interface FileInfo {
  path: string;
  filename: string;
  content: string;
  hash: string;
  lastModified: number;
  size: number;
  exists: boolean;
}

const getFileInfo = async (filePath: string): Promise<FileInfo> => {
  const content = await Bun.file(filePath).text();
  const hash = createHash("sha256")
    .update(content, "utf8")
    .digest("hex")
    .slice(0, 16);
  const stats = await stat(filePath);
  return {
    path: filePath,
    filename: basename(filePath),
    content,
    hash,
    lastModified: stats.mtimeMs,
    size: stats.size,
    exists: true,
  };
};

export async function createFileList(
  directory: string,
  include: string,
  exclude?: string,
  options?: { watch?: boolean },
): Promise<List<FileInfo>> {
  const glob = new Glob(include);
  const excludeGlob = exclude ? new Glob(exclude) : null;

  // Scan initial files (skip if directory doesn't exist)
  const initialFiles: FileInfo[] = [];
  const dirExists = existsSync(directory);
  if (dirExists) {
    for await (const file of glob.scan(directory)) {
      if (excludeGlob?.match(file)) continue;
      const filePath = join(directory, file);
      const fileInfo = await getFileInfo(filePath);
      initialFiles.push(fileInfo);
    }
  }

  const isMatching = (filename: string): boolean => {
    if (!glob.match(filename)) return false;
    if (excludeGlob?.match(filename)) return false;
    return true;
  };

  const watchEnabled = options?.watch ?? false;

  // File change handler shared between watched callback closure and eager mode
  const handleFileChange = async (
    fileList: List<FileInfo>,
    filename: string,
  ) => {
    if (!isMatching(filename)) return;

    const filePath = join(directory, filename);
    if (!existsSync(filePath)) {
      fileList.remove(filePath);
    } else {
      const fileInfo = await getFileInfo(filePath);
      const existing = fileList.byKey(filePath);
      if (existing) {
        if (existing.get().hash !== fileInfo.hash) existing.set(fileInfo);
      } else {
        fileList.add(fileInfo);
      }
    }
  };

  const fileList = createList<FileInfo>(initialFiles, {
    keyConfig: (item) => item.path,
    ...(watchEnabled && dirExists
      ? {
          watched: () => {
            const watcher = watch(
              directory,
              {
                recursive: include.includes("**/"),
                persistent: true,
              },
              async (_event, filename) => {
                if (!filename) return;
                await handleFileChange(fileList, filename);
              },
            );
            return () => watcher.close();
          },
        }
      : {}),
  });

  return fileList;
}
