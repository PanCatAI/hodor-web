import mammoth from "mammoth";

import type { ImportNovelInput, ImportScriptInput } from "./story-api";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const NUMBER_DIGITS: Record<string, number> = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const NUMBER_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const DEFAULT_CHAPTER_PATTERN = /第\s*([0-9０-９零一二三四五六七八九十百千万]+)\s*[章回节]\s*([^\n\r]*)/g;
const DEFAULT_EPISODE_PATTERN = /第\s*([0-9０-９零一二三四五六七八九十百千万]+)\s*集\s*([^\n\r]*)/g;
const REEL_PATTERN = /^(第[\d一二三四五六七八九十百千]+卷)\s*([^\n第]*)/gm;

function parseNumber(raw: string): number {
  const normalized = raw.replace(/[０-９]/g, (value) => String("０１２３４５６７８９".indexOf(value)));
  if (/^\d+$/.test(normalized)) return Number(normalized);
  let total = 0;
  let digit = 0;
  for (const character of normalized) {
    if (NUMBER_DIGITS[character] !== undefined) digit = NUMBER_DIGITS[character];
    else if (NUMBER_UNITS[character] !== undefined) {
      total += (digit || 1) * NUMBER_UNITS[character];
      digit = 0;
    }
  }
  return total + digit || 1;
}

function parsePattern(value: string | undefined, fallback: RegExp): RegExp {
  if (!value?.trim()) return new RegExp(fallback.source, fallback.flags);
  const literal = value.match(/^\/(.*)\/([dgimsuvy]*)$/);
  const flags = literal?.[2] ?? "g";
  return new RegExp(literal?.[1] ?? value, flags.includes("g") ? flags : `${flags}g`);
}

function parseChapters(text: string, reel: string, offset: number, pattern: RegExp): ImportNovelInput[] {
  pattern.lastIndex = 0;
  const matches = Array.from(text.matchAll(pattern));
  if (!matches.length) {
    const content = text.trim();
    return content ? [{ index: offset || 1, reel, chapter: "未命名章节", chapterData: content }] : [];
  }
  return matches.map((match, position) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[position + 1]?.index ?? text.length;
    return {
      index: parseNumber(match[1]),
      reel,
      chapter: match[2]?.trim() || `第${match[1]}章`,
      chapterData: text.slice(start, end).replace(/^[\r\n]+/, "").trim(),
    };
  });
}

export function parseNovelText(text: string, customPattern?: string): ImportNovelInput[] {
  const chapterPattern = parsePattern(customPattern, DEFAULT_CHAPTER_PATTERN);
  REEL_PATTERN.lastIndex = 0;
  const reels = Array.from(text.matchAll(REEL_PATTERN));
  if (!reels.length) return parseChapters(text, "正文卷", 1, chapterPattern).sort((a, b) => a.index - b.index);

  return reels
    .flatMap((match, position) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = reels[position + 1]?.index ?? text.length;
      return parseChapters(text.slice(start, end), match[2]?.trim() || match[1], 1, chapterPattern);
    })
    .sort((a, b) => a.index - b.index);
}

export function parseScriptText(text: string, customPattern?: string): Array<ImportScriptInput & { index: number }> {
  const pattern = parsePattern(customPattern, DEFAULT_EPISODE_PATTERN);
  pattern.lastIndex = 0;
  const matches = Array.from(text.matchAll(pattern));
  if (!matches.length) {
    const content = text.trim();
    return content ? [{ index: 1, scriptName: "第一集", scriptData: content }] : [];
  }
  return matches
    .map((match, position) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[position + 1]?.index ?? text.length;
      const index = parseNumber(match[1]);
      return {
        index,
        scriptName: match[2]?.trim() || `第${index}集`,
        scriptData: text.slice(start, end).replace(/^[\r\n]+/, "").trim(),
      };
    })
    .sort((a, b) => a.index - b.index);
}

export async function readImportFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("文件不能超过 10MB");
  const extension = file.name.split(".").pop()?.toLowerCase();
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
  if (extension === "txt" || file.type === "text/plain") return new TextDecoder().decode(buffer);
  if (extension !== "docx" && file.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    throw new Error("仅支持 TXT 和 DOCX 文件");
  }
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}
