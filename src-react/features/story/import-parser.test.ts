import { describe, expect, it } from "vitest";

import { parseNovelText, parseScriptText, readImportFile } from "./import-parser";

describe("story import parser", () => {
  it("parses chapters from a plain-text novel", () => {
    expect(parseNovelText("第一章 雨夜\n她推开门。\n第二章 追踪\n脚步声逼近。")).toEqual([
      { index: 1, reel: "正文卷", chapter: "雨夜", chapterData: "她推开门。" },
      { index: 2, reel: "正文卷", chapter: "追踪", chapterData: "脚步声逼近。" },
    ]);
  });

  it("parses episode files and preserves episode order", () => {
    expect(parseScriptText("第二集 追踪\n走廊。\n第一集 雨夜\n医院。")).toEqual([
      { index: 1, scriptName: "雨夜", scriptData: "医院。" },
      { index: 2, scriptName: "追踪", scriptData: "走廊。" },
    ]);
  });

  it("reads txt files and rejects unsupported formats", async () => {
    await expect(readImportFile(new File(["正文"], "novel.txt", { type: "text/plain" }))).resolves.toBe("正文");
    await expect(readImportFile(new File(["x"], "novel.pdf", { type: "application/pdf" }))).rejects.toThrow("仅支持 TXT 和 DOCX");
  });
});
