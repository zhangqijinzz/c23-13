import { describe, expect, it } from "vitest";
import {
  parseSubtitleDocument,
  parseSubtitles,
} from "../parsers/subtitleParser";
import { formatSubtitles } from "../formatters/subtitleFormatter";
import {
  getVisibleText,
  parseMarkup,
  serializeMarkup,
} from "../parsers/markup";

describe("subtitle parser and formatter", () => {
  it("parses multiline SRT and preserves text on round trip", () => {
    const raw =
      "1\n00:00:01,120 --> 00:00:03,500\n第一行\n第二行\n\n2\n00:00:04,000 --> 00:00:06,000\n结束";
    const cues = parseSubtitles(raw, "srt");
    expect(cues[0]).toMatchObject({
      startMs: 1120,
      endMs: 3500,
      text: "第一行\n第二行",
    });
    expect(parseSubtitles(formatSubtitles(cues, "srt"), "srt")).toEqual(cues);
  });

  it("parses WebVTT headers and cue settings", () => {
    const cues = parseSubtitles(
      "WEBVTT\n\n00:00:00.500 --> 00:00:02.000 align:start\nHello\n\n00:02.100 --> 00:03.000\nWorld",
      "vtt",
    );
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(500);
    expect(cues[0].settings).toBe("align:start");
    expect(cues[1].startMs).toBe(2100);
  });

  it("ignores comments, style, and region definition blocks", () => {
    const raw = [
      "WEBVTT",
      "",
      "NOTE",
      "这是平台导出说明",
      "",
      "STYLE",
      "::cue { color: red }",
      "",
      "REGION",
      "id:top",
      "width:100%",
      "",
      "intro",
      "00:00:01.000 --> 00:00:02.000",
      "可见文本",
    ].join("\n");
    expect(parseSubtitles(raw, "vtt")).toMatchObject([{ text: "可见文本" }]);
  });

  it("keeps style and region blocks in WebVTT but removes them in SRT", () => {
    const raw = [
      "WEBVTT",
      "",
      "STYLE",
      "::cue(.hot) { color: red }",
      "",
      "REGION",
      "id:top",
      "",
      "00:00:01.000 --> 00:00:02.000",
      "Hello",
    ].join("\n");
    const document = parseSubtitleDocument(raw, "vtt");
    const cues = document.cues;
    const vtt = formatSubtitles(cues, "vtt", document.definitions);
    expect(vtt).toContain("STYLE\n::cue(.hot) { color: red }");
    expect(vtt).toContain("REGION\nid:top");
    expect(formatSubtitles(cues, "srt")).not.toContain("STYLE");
  });

  it("counts only displayed WebVTT text and keeps speaker-aware formatting", () => {
    const raw = [
      "WEBVTT",
      "",
      "1",
      "00:00:01.000 --> 00:00:03.000",
      "<v Bob><b.hot>Hello</b><00:00:02.000> there</v>",
    ].join("\n");
    const cues = parseSubtitles(raw, "vtt");
    expect(cues[0].text).toBe("Hello there");
    expect(formatSubtitles(cues, "vtt")).toContain(
      "<v Bob><b.hot>Hello</b><00:00:02.000> there</v>",
    );
  });

  it("converts WebVTT-only marks when exporting to SRT", () => {
    const cues = parseSubtitles(
      [
        "WEBVTT",
        "",
        "00:00:01.000 --> 00:00:03.000",
        "<v Alice><c.whisper>Hi</c> <lang fr>Bonjour</lang></v>",
        "00:00:04.000 --> 00:00:05.000",
        "<ruby>汉<rt>hàn</rt></ruby>",
      ].join("\n"),
      "vtt",
    );
    const srt = formatSubtitles(cues, "srt");
    expect(srt).toContain("Hi Bonjour");
    expect(srt).not.toMatch(/<\/?(v|c|lang|rt|rp)[ .>]/);
    expect(srt).toContain("汉（hàn）");
  });

  it("handles marks spanning lines and unclosed or crossing markup deterministically", () => {
    const nodes = parseMarkup("<b>bold first\n<i>crossed</b> tail\nplain");
    expect(getVisibleText(nodes)).toBe("bold first\ncrossed tail\nplain");
    const vtt = serializeMarkup(nodes, "vtt");
    expect(vtt).toBe("<b>bold first\n<i>crossed</i></b><i> tail\nplain</i>");
    expect(getVisibleText(parseMarkup(vtt))).toBe(
      "bold first\ncrossed tail\nplain",
    );
  });

  it("reports malformed and reversed timecodes", () => {
    expect(() => parseSubtitles("1\nwrong --> time\nOops", "srt")).toThrow(
      "无法解析时间码",
    );
    expect(() =>
      parseSubtitles("1\n00:00:02,000 --> 00:00:01,000\nOops", "srt"),
    ).toThrow("结束时间");
  });
});
