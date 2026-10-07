import { describe, expect, it } from "vitest";
import { parseSubtitles } from "../parsers/subtitleParser";
import { formatSubtitles } from "../formatters/subtitleFormatter";
import { sanitizeMarkup, toPlainText } from "../parsers/markup";
import type { SubtitleCue } from "../models";
const cue = (text: string): SubtitleCue => ({
  id: "cue-1",
  index: 1,
  startMs: 0,
  endMs: 2000,
  text,
});
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
      "WEBVTT\n\n00:00:00.500 --> 00:00:02.000 align:start\nHello\n\n00:00:02.100 --> 00:00:03.000\nWorld",
      "vtt",
    );
    expect(cues).toHaveLength(2);
    expect(cues[0].startMs).toBe(500);
  });
  it("reports malformed and reversed timecodes", () => {
    expect(() => parseSubtitles("1\nwrong --> time\nOops", "srt")).toThrow(
      "无法解析时间码",
    );
    expect(() =>
      parseSubtitles("1\n00:00:02,000 --> 00:00:01,000\nOops", "srt"),
    ).toThrow("结束时间");
  });
  it("skips WebVTT header metadata, NOTE, STYLE, and REGION blocks", () => {
    const raw = [
      "WEBVTT",
      "Kind: captions",
      "Language: zh-Hans",
      "",
      "NOTE 这是平台写出的单行注释",
      "",
      "NOTE",
      "跨多行的注释",
      "注释第二行",
      "",
      "STYLE",
      "::cue { color: lime; }",
      "",
      "REGION",
      "id:fred",
      "width:40%",
      "",
      "00:00:01.000 --> 00:00:02.000",
      "正文",
    ].join("\n");
    const cues = parseSubtitles(raw, "vtt");
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("正文");
  });
  it("ignores unrecognized WebVTT blocks but rejects them in SRT", () => {
    expect(
      parseSubtitles(
        "WEBVTT\n\nnot a cue\n\n00:00:01.000 --> 00:00:02.000\n好",
        "vtt",
      ),
    ).toHaveLength(1);
    expect(() => parseSubtitles("not a cue", "srt")).toThrow("缺少时间码");
  });
});
describe("inline markup handling", () => {
  it("strips voice, class, formatting, and timestamp tags from display text", () => {
    expect(
      toPlainText("<v 张三><c.yellow>你好</c></v><00:00:01.000>世界"),
    ).toBe("你好世界");
    expect(toPlainText("<b><i>嵌套</i></b>正常")).toBe("嵌套正常");
  });
  it("gives deterministic results for unclosed, line-spanning, and stray tags", () => {
    expect(toPlainText("<i>未闭合")).toBe("未闭合");
    expect(toPlainText("前<v\n张三>后")).toBe("前后");
    expect(toPlainText("a < b 和 <未闭合")).toBe("a < b 和 <未闭合");
    expect(toPlainText("</v 张三>非法闭合")).toBe("非法闭合");
  });
  it("decodes entities when measuring display text", () => {
    expect(toPlainText("a &amp; b&lt;")).toBe("a & b<");
    expect(toPlainText("&#20320;&#x597D;")).toBe("你好");
  });
  it("keeps allowed tags per export format and drops the rest", () => {
    const text = "<v 张三><i>斜体</i><c.yellow>彩色</c></v><00:00:01.000>尾";
    expect(sanitizeMarkup(text, "srt")).toBe("<i>斜体</i>彩色尾");
    expect(sanitizeMarkup(text, "vtt")).toBe(text);
    expect(sanitizeMarkup('<font color="red">字</font>', "srt")).toBe(
      '<font color="red">字</font>',
    );
    expect(sanitizeMarkup('<font color="red">字</font>', "vtt")).toBe("字");
  });
  it("escapes stray angle brackets and ampersands only for WebVTT export", () => {
    expect(sanitizeMarkup("a < b & c", "vtt")).toBe("a &lt; b &amp; c");
    expect(sanitizeMarkup("a &amp; b", "vtt")).toBe("a &amp; b");
    expect(sanitizeMarkup("a < b & c", "srt")).toBe("a < b & c");
  });
  it("sanitizes markup when exporting to another format", () => {
    const tagged = cue("<v 张三><i>斜体</i></v><00:00:01.000>跟唱");
    const srt = formatSubtitles([tagged], "srt");
    expect(srt).toContain("<i>斜体</i>跟唱");
    expect(srt).not.toContain("<v");
    expect(srt).not.toContain("00:00:01.000>");
    const vtt = formatSubtitles([tagged], "vtt");
    expect(vtt).toContain("<v 张三><i>斜体</i></v><00:00:01.000>跟唱");
  });
});
