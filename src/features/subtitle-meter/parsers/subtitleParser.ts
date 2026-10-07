import type { Format, SubtitleCue, SubtitleDefinition } from "../models";
import { getVisibleText, parseMarkup } from "./markup";
import { parseTimestamp } from "./timecode";

export interface ParsedSubtitleDocument {
  cues: SubtitleCue[];
  definitions: SubtitleDefinition[];
}

export function detectFormat(name: string): Format {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "srt" || ext === "vtt") return ext;
  throw new Error("仅支持 .srt 或 .vtt 文件");
}

export function parseSubtitles(raw: string, format: Format): SubtitleCue[] {
  return parseSubtitleDocument(raw, format).cues;
}

export function parseSubtitleDocument(
  raw: string,
  format: Format,
): ParsedSubtitleDocument {
  const source = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const allLines = source.split("\n");
  const cues: SubtitleCue[] = [];
  const definitions: SubtitleDefinition[] = [];
  let blockNumber = 0;
  let position = 0;

  while (position < allLines.length) {
    while (position < allLines.length && !allLines[position]?.trim())
      position += 1;

    const start = position;
    while (position < allLines.length && allLines[position]?.trim())
      position += 1;
    const block = allLines.slice(start, position);
    if (!block.length) break;

    blockNumber += 1;
    const first = block[0]?.trim() ?? "";
    if (blockNumber === 1 && format === "vtt" && first.startsWith("WEBVTT"))
      continue;
    if (/^NOTE(\s|$)/.test(first)) continue;

    const definition = /^(STYLE|REGION)(\s|$)/.exec(first);
    if (definition) {
      if (format === "vtt")
        definitions.push({
          kind: definition[1] as SubtitleDefinition["kind"],
          content: block.slice(1).join("\n").trim(),
        });
      continue;
    }

    const timeIndex = block.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) throw new Error(`第 ${blockNumber} 段缺少时间码`);

    const [from, ...rest] = block[timeIndex].split("-->");
    const [to, ...settingsParts] = rest.join("-->").trim().split(/\s+/);
    const startMs = parseTimestamp(from);
    const endMs = parseTimestamp(to ?? "");
    if (endMs <= startMs)
      throw new Error(`第 ${blockNumber} 段结束时间必须晚于开始时间`);

    const rawText = block
      .slice(timeIndex + 1)
      .join("\n")
      .trim();
    const markup = parseMarkup(rawText);
    const text = getVisibleText(markup).trim();

    cues.push({
      id: `cue-${cues.length + 1}`,
      index: cues.length + 1,
      startMs,
      endMs,
      text,
      ...(format === "vtt" && settingsParts.length
        ? { settings: settingsParts.join(" ") }
        : {}),
      markup,
    });
  }

  if (!cues.length) throw new Error("没有找到可用字幕条目");
  return { cues, definitions };
}
