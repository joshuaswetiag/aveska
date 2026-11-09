import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function sqlFiles(dir) {
  const entries = await readdir(dir, { recursive: true });
  return entries.filter((name) => String(name).endsWith(".sql")).map(String).sort();
}

function normalize(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function concat(base, files) {
  const parts = [];
  for (const file of files) parts.push(await readFile(join(base, file), "utf8"));
  return normalize(parts.join("\n"));
}

const wranglerDir = join(process.cwd(), "migrations");
const prismaDir = join(process.cwd(), "prisma", "migrations");
const wranglerFiles = await sqlFiles(wranglerDir);
const prismaFiles = await sqlFiles(prismaDir);
const left = await concat(wranglerDir, wranglerFiles);
const right = await concat(prismaDir, prismaFiles);

if (left !== right) {
  console.error("D1 migrations/ and prisma/migrations do not contain the same SQL.");
  console.error(`wrangler: ${wranglerFiles.join(", ")}`);
  console.error(`prisma: ${prismaFiles.join(", ")}`);
  process.exit(1);
}

console.log(`Migration SQL matches (${wranglerFiles.length} file${wranglerFiles.length === 1 ? "" : "s"}).`);
