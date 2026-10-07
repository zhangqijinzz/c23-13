import type { Format, SubtitleCue, SubtitleDefinition } from "../models";
import {
  parsePlainText,
  serializeMarkup,
  type MarkupNode,
} from "../parsers/markup";
import { formatTimestamp } from "../parsers/timecode";

export function formatSubtitles(
  cues: SubtitleCue[],
  format: Format,
  definitions: SubtitleDefinition[] = [],
): string {
  const prefix =
    format === "vtt" && definitions.length
      ? definitions
          .map((definition) => `${definition.kind}\n${definition.content}`)
          .join("\n\n")
      : "";
  const body = [...cues]
    .sort((a, b) => a.startMs - b.startMs)
    .map((cue, index) => {
      const number = format === "srt" ? index + 1 : cue.id;
      const timing = `${formatTimestamp(cue.startMs, format)} --> ${formatTimestamp(cue.endMs, format)}`;
      const settings =
        format === "vtt" && cue.settings ? ` ${cue.settings}` : "";
      return `${number}\n${timing}${settings}\n${serializeCue(cue, format)}`;
    })
    .join("\n\n");

  if (format === "vtt")
    return prefix ? `WEBVTT\n\n${prefix}\n\n${body}\n` : `WEBVTT\n\n${body}\n`;
  return `${body}\n`;
}

export function serializeCue(cue: SubtitleCue, format: Format): string {
  return serializeMarkup(cueMarkup(cue), format);
}

export function cueMarkup(cue: SubtitleCue): MarkupNode[] {
  return cue.markup ?? parsePlainText(cue.text);
}
