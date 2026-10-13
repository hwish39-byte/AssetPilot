import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = "assets/logo-options";
mkdirSync(outDir, { recursive: true });

const width = 1024;
const height = 1024;

const variants = [
  {
    id: "01",
    bg: "#ffffff",
    left: "#139fd6",
    right: "#202020",
    subtitle: "#dbe9ee",
    font: "Menlo, Monaco, 'Courier New', monospace",
    size: 130,
    weight: 500,
    y: 512,
    split: 5,
    note: "clean-white"
  },
  {
    id: "02",
    bg: "#f7fbfa",
    left: "#16a6a8",
    right: "#27313a",
    subtitle: "#d7ece8",
    font: "Menlo, Monaco, 'Courier New', monospace",
    size: 126,
    weight: 500,
    y: 512,
    split: 5,
    note: "soft-teal"
  },
  {
    id: "03",
    bg: "#fffaf0",
    left: "#2288c9",
    right: "#d7a032",
    subtitle: "#ece2c9",
    font: "Menlo, Monaco, 'Courier New', monospace",
    size: 126,
    weight: 600,
    y: 512,
    split: 5,
    note: "warm-gold"
  },
  {
    id: "04",
    bg: "#eef8fb",
    left: "#1c7ed6",
    right: "#0f766e",
    subtitle: "#c8e2e8",
    font: "Menlo, Monaco, 'Courier New', monospace",
    size: 126,
    weight: 600,
    y: 512,
    split: 5,
    note: "blue-green"
  },
  {
    id: "05",
    bg: "#ffffff",
    left: "#111827",
    right: "#12a8c8",
    subtitle: "#e9eef2",
    font: "Menlo, Monaco, 'Courier New', monospace",
    size: 124,
    weight: 500,
    y: 512,
    split: 5,
    note: "inverse-accent"
  },
  {
    id: "06",
    bg: "#f5f2eb",
    left: "#118ab2",
    right: "#2f3a3d",
    subtitle: "#dfd8c9",
    font: "Menlo, Monaco, 'Courier New', monospace",
    size: 128,
    weight: 500,
    y: 512,
    split: 5,
    note: "paper-soft"
  }
];

function svgFor(variant) {
  const text = "AssetPilot";
  const leftText = text.slice(0, variant.split);
  const rightText = text.slice(variant.split);
  const charWidth = variant.size * 0.62;
  const totalWidth = text.length * charWidth;
  const x = (width - totalWidth) / 2;
  const leftWidth = leftText.length * charWidth;
  const shadowY = variant.y + 6;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${variant.bg}"/>
  <g opacity="0.5">
    <rect x="${x}" y="${shadowY - variant.size * 0.7}" width="${totalWidth}" height="18" fill="${variant.subtitle}"/>
  </g>
  <text x="${x}" y="${variant.y}" font-family="${variant.font}" font-size="${variant.size}" font-weight="${variant.weight}" letter-spacing="0" dominant-baseline="middle">
    <tspan fill="${variant.left}">${leftText}</tspan><tspan fill="${variant.right}">${rightText}</tspan>
  </text>
  <g opacity="0.2" fill="${variant.left}">
    <rect x="${x + totalWidth - 16}" y="${variant.y - variant.size * 0.78}" width="10" height="10"/>
    <rect x="${x + 4}" y="${variant.y + variant.size * 0.54}" width="10" height="10"/>
  </g>
</svg>
`;
}

for (const variant of variants) {
  const base = `assetpilot-logo-option-${variant.id}-${variant.note}`;
  const svgPath = join(outDir, `${base}.svg`);
  const pngPath = join(outDir, `${base}.png`);
  writeFileSync(svgPath, svgFor(variant), "utf8");
  execFileSync("/opt/homebrew/bin/rsvg-convert", ["-w", String(width), "-h", String(height), "-f", "png", "-o", pngPath, svgPath]);
}
