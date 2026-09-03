import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 黑白灰主题合同（monochrome theme contract）。
 *
 * 静态扫描 src-react 下的 ts/tsx/css：禁止彩色 Tailwind 工具类（red/orange/amber/
 * yellow/lime/green/emerald/teal/cyan/sky/blue/indigo/violet/purple/fuchsia/pink/rose）
 * 与非灰阶颜色（hex/rgb/hsl）、彩色 gradient/glow 回归。
 *
 * 允许：
 * - 媒体 URL（图片/视频/音频路径，含 url(...)、src/href/poster 属性、http(s) 地址）；
 * - 透明黑白灰（rgba(0,0,0,x)、rgba(255,255,255,x) 及任意 r==g==b 的透明灰）；
 * - 纯灰阶 hex/rgb/hsl（r===g===b，hsl 饱和度为 0）。
 *
 * 只做静态扫描，不改业务逻辑。
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src-react");

const COLOR_NAMES = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

const COLOR_ALTERNATION = COLOR_NAMES.join("|");

/** 递归收集 src-react 下全部 ts/tsx/css 文件。 */
function collectFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(path, out);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** 把媒体/URL 上下文替换成占位符，避免把资源地址误判为颜色。 */
function maskMedia(line) {
  return line
    .replace(/url\(\s*['"]?[^)'"]+['"]?\s*\)/gi, "url(#)")
    .replace(/\b(?:src|href|poster)\s*=\s*["'][^"']*["']/gi, '$1="#"')
    .replace(/["'][^"']*\.(?:png|jpe?g|webp|gif|avif|mp4|webm|mov|mp3|wav|ogg|m4a|svg)["']/gi, '"#"')
    .replace(/https?:\/\/[^\s"'`)]+/g, "#");
}

function isHexGrayscale(hex) {
  let value = hex.slice(1);
  if (value.length === 3 || value.length === 4) value = value.replace(/./g, (ch) => ch + ch);
  if (value.length !== 6 && value.length !== 8) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r === g && g === b;
}

/** 把 hsl 三个分量解析出来；无法解析返回 null。 */
function parseHsl(body) {
  const numbers = body.replace(/[,/]/g, " ").match(/-?\d*\.?\d+/g);
  if (!numbers || numbers.length < 3) return null;
  return {
    h: Number(numbers[0]),
    s: Number(numbers[1]),
    l: Number(numbers[2]),
  };
}

/** 把 rgb/rgba 的三个颜色通道解析出来；无法解析返回 null。 */
function parseRgb(body) {
  const clean = body.replace(/,/g, " ").trim();
  const match = clean.match(/^(-?\d*\.?\d+%?)(?:\s+(-?\d*\.?\d+%?))(?:\s+(-?\d*\.?\d+%?))/);
  if (!match) return null;
  return {
    r: match[1],
    g: match[2],
    b: match[3],
  };
}

/** rgb 通道值（可能带 %）转 0-255。 */
function channelToNumber(channel) {
  if (channel.endsWith("%")) return (Number(channel.slice(0, -1)) / 100) * 255;
  return Number(channel);
}

function isRgbGrayscale(channels) {
  const r = channelToNumber(channels.r);
  const g = channelToNumber(channels.g);
  const b = channelToNumber(channels.b);
  return r === g && g === b;
}

function isHslGrayscale(hsl) {
  return hsl.s === 0 || hsl.l === 0 || hsl.l === 100;
}

const CLASS_TOKEN_RE = new RegExp(
  `(?<![\\w-])(?:!?)(?:[\\w-]+:)*(?:bg|text|border|ring|accent|divide|placeholder|from|via|to|fill|stroke|outline|decoration|caret|shadow)-(?:${COLOR_ALTERNATION})-\\d{2,3}(?:/[.\\d]+)?`,
  "g",
);

const HEX_RE = /#[0-9a-fA-F]{3,4}(?:[0-9a-fA-F]{2}){1,2}|#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?/g;

const RGB_RE = /rgba?\([^)]*\)/gi;
const HSL_RE = /hsla?\([^)]*\)/gi;

function violationsFor(text) {
  const found = new Set();
  for (const match of text.matchAll(CLASS_TOKEN_RE)) {
    found.add(`彩色 Tailwind 类「${match[0]}」`);
  }
  for (const match of text.matchAll(HEX_RE)) {
    if (!isHexGrayscale(match[0])) found.add(`非灰阶 hex「${match[0]}」`);
  }
  for (const match of text.matchAll(RGB_RE)) {
    const channels = parseRgb(match[0].slice(match[0].startsWith("rgba") ? 5 : 4, -1));
    if (channels && !isRgbGrayscale(channels)) found.add(`非灰阶 rgb「${match[0]}」`);
  }
  for (const match of text.matchAll(HSL_RE)) {
    const hsl = parseHsl(match[0].slice(match[0].startsWith("hsla") ? 5 : 4, -1));
    if (hsl && !isHslGrayscale(hsl)) found.add(`非灰阶 hsl「${match[0]}」`);
  }
  return [...found];
}

test("src-react 黑白灰主题合同：禁止彩色 Tailwind 类与非灰阶颜色", () => {
  const files = collectFiles();
  assert.ok(files.length > 0, "应能扫描到 src-react 下的 ts/tsx/css 文件");

  const report = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const lines = raw.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const masked = maskMedia(lines[index]);
      const violations = violationsFor(masked);
      if (violations.length > 0) {
        report.push(`${file.replace(ROOT + "/", "")}:${index + 1} -> ${violations.join("；")}`);
      }
    }
  }
  assert.equal(
    report.length,
    0,
    `检测到彩色类/非灰阶颜色回归（${report.length} 处）：\n${report.join("\n")}`,
  );
});
