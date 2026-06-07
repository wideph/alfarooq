const { copyFileSync, existsSync, mkdirSync } = require("fs");
const { join } = require("path");

const src = join(process.cwd(), "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(process.cwd(), "public");
const dest = join(destDir, "pdf.worker.min.mjs");

try {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  console.log("PDF worker copied to public/pdf.worker.min.mjs");
} catch (err) {
  console.warn("Could not copy PDF worker:", err);
}
