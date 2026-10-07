import type { Format, SubtitleCue } from "../models";
import { parseTimestamp } from "./timecode";
export function detectFormat(name: string): Format {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "srt" || ext === "vtt") return ext;
  throw new Error("仅支持 .srt 或 .vtt 文件");
}
export function parseSubtitles(raw: string, format: Format): SubtitleCue[] {
  const source = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = source
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const cues: SubtitleCue[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    const lines = block.split("\n");
    if (format === "vtt") {
      // 文件头（可含 Kind:/Language: 等元数据行，整块跳过）
      if (blockIndex === 0 && lines[0]?.startsWith("WEBVTT")) continue;
      // 注释块、样式定义块、区域定义块：NOTE/STYLE/REGION 后可同行
      // 跟内容，也可独占一行后跨多行，整块都不含字幕文本
      if (/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0] ?? "")) continue;
    }
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) {
      // WebVTT 规范：无法识别的块直接忽略；SRT 无此概念，按损坏文件报错
      if (format === "vtt") continue;
      throw new Error(`第 ${blockIndex + 1} 段缺少时间码`);
    }
    const [from, toWithSettings] = lines[timeIndex].split("-->");
    const startMs = parseTimestamp(from),
      endMs = parseTimestamp(toWithSettings.trim().split(/\s+/)[0]);
    if (endMs <= startMs)
      throw new Error(`第 ${blockIndex + 1} 段结束时间必须晚于开始时间`);
    cues.push({
      id: `cue-${cues.length + 1}`,
      index: cues.length + 1,
      startMs,
      endMs,
      text: lines
        .slice(timeIndex + 1)
        .join("\n")
        .trim(),
    });
  }
  if (!cues.length) throw new Error("没有找到可用字幕条目");
  return cues;
}
