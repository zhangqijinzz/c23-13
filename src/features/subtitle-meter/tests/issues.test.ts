import { describe, expect, it } from "vitest";
import { detectIssues } from "../analyzers/issueDetector";
import type { SubtitleCue } from "../models";
const cue = (
  id: string,
  startMs: number,
  endMs: number,
  text: string,
): SubtitleCue => ({ id, index: Number(id), startMs, endMs, text });
describe("issue detection", () => {
  it("distinguishes touching edges from overlap", () => {
    expect(
      detectIssues([cue("1", 0, 1000, "A"), cue("2", 1000, 2000, "B")]).some(
        (i) => i.type === "overlap",
      ),
    ).toBe(false);
    expect(
      detectIssues([cue("1", 0, 1300, "A"), cue("2", 1000, 2000, "B")]).some(
        (i) => i.type === "overlap",
      ),
    ).toBe(true);
  });
  it("detects empty, short, fast, and long captions", () => {
    const issues = detectIssues([
      cue("1", 0, 100, ""),
      cue("2", 1000, 1300, "这是一个用于检查速度的非常长的字幕内容".repeat(3)),
    ]);
    expect(issues.map((i) => i.type)).toEqual(
      expect.arrayContaining(["empty", "too-short", "too-fast", "too-long"]),
    );
  });
  it("measures reading speed and line count on display text only", () => {
    const tagged = cue(
      "1",
      0,
      1000,
      "<v 张三大声道><c.yellow.bold>你好</c></v><00:00:00.500>吗",
    );
    const issues = detectIssues([tagged]);
    expect(issues.some((i) => i.type === "too-fast")).toBe(false);
    expect(issues.some((i) => i.type === "too-long")).toBe(false);
    // 同样的可见文本不带标签时结论应一致
    expect(detectIssues([cue("2", 0, 1000, "你好吗")])).toHaveLength(0);
  });
  it("treats tag-only cues as empty and ignores line-spanning tags", () => {
    const issues = detectIssues([
      cue("1", 0, 2000, "<v 张三><c.yellow></c></v>"),
      cue("2", 3000, 6000, "第一行\n第二行"),
      cue("3", 7000, 10000, "前<v\n张三>后"),
    ]);
    expect(issues.some((i) => i.cueId === "1" && i.type === "empty")).toBe(
      true,
    );
    expect(issues.some((i) => i.cueId === "3" && i.type === "too-long")).toBe(
      false,
    );
  });
});
