import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
const fallbackPublicDataDir = path.resolve(repoRoot, "fixtures/public-data/public");

const contentTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function resolvePublicDataDir(): string {
  if (process.env.PUBLIC_DATA_DIR) {
    return path.resolve(process.env.PUBLIC_DATA_DIR);
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "fixtures/public-data/public"),
    path.resolve(cwd, "../fixtures/public-data/public"),
    fallbackPublicDataDir
  ];

  return candidates.find((candidate) => existsSync(path.join(candidate, "index/latest.json"))) ?? candidates[0];
}

async function listAssetPaths(root: string, current = ""): Promise<string[]> {
  const directory = path.join(root, current);
  if (!existsSync(directory)) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  const results = await Promise.all(
    entries.map((entry) => {
      const relativePath = current ? `${current}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return listAssetPaths(root, relativePath);
      if (entry.isFile() && contentTypes[path.extname(entry.name).toLowerCase()]) return Promise.resolve([relativePath]);
      return Promise.resolve([]);
    })
  );

  return results.flat();
}

export async function getStaticPaths() {
  const publicDataDir = resolvePublicDataDir();
  const webPublicDataDir = path.resolve(process.cwd(), "public/data");
  if (path.relative(webPublicDataDir, publicDataDir) === "") {
    return [];
  }

  const assetsRoot = path.join(publicDataDir, "assets");
  const assetPaths = await listAssetPaths(assetsRoot);
  return assetPaths.map((assetPath) => ({
    params: { assetPath }
  }));
}

export async function GET({ params }: { params: { assetPath?: string } }) {
  const assetPath = params.assetPath ?? "";
  const assetsRoot = path.join(resolvePublicDataDir(), "assets");
  const absolutePath = path.resolve(assetsRoot, assetPath);
  const relative = path.relative(assetsRoot, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return new Response("Not found", { status: 404 });
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = contentTypes[extension];
  if (!contentType) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const bytes = await readFile(absolutePath);
    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
