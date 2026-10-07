import type { Format } from "../models";

// WebVTT 内联标签：标签名以字母开头，注解可含除 ">" 外的任意字符（含换行，
// 因此标签可以跨行）；时间戳标签形如 <00:00:01.000> 或 <00:01.000>。
const TAG_NAME = /^[A-Za-z][A-Za-z0-9]*/;
const TIMESTAMP_TAG = /^\d{2}:\d{2}(?::\d{2})?\.\d{3}$/;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  lrm: "\u200E",
  rlm: "\u200F",
};

interface TagToken {
  raw: string;
  name: string;
  timestamp: boolean;
}

// 从 text[start]（应为 "<"）处解析一个标签；无法识别时返回 null，
// 调用方按字面文本处理，保证未闭合、非法写法都有确定结果。
function scanTag(text: string, start: number): TagToken | null {
  const end = text.indexOf(">", start + 1);
  if (end < 0) return null;
  const inner = text.slice(start + 1, end);
  if (TIMESTAMP_TAG.test(inner))
    return { raw: text.slice(start, end + 1), name: "", timestamp: true };
  const body = inner.startsWith("/") ? inner.slice(1) : inner;
  const name = body.match(TAG_NAME);
  if (!name) return null;
  const annotation = body.slice(name[0].length);
  // 标签名之后只能是类名（<c.a.b>）或空白开头的注解（<v 张三>、</v 张三>），
  // 注解内容不显示；其余写法（如 <i/>）不是合法标签，按字面文本处理
  if (annotation && !/^[\s.]/.test(annotation)) return null;
  return {
    raw: text.slice(start, end + 1),
    name: name[0].toLowerCase(),
    timestamp: false,
  };
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:([A-Za-z]+)|#(\d+)|#[xX]([0-9A-Fa-f]+));/g,
    (raw, named: string, dec: string, hex: string) => {
      if (named) return ENTITIES[named] ?? raw;
      const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;
    },
  );
}

// 播放器真正会显示的文本：去掉所有标签（含未闭合、嵌套、跨行写法），
// 并解码实体，供字数 / 阅读速度 / 行数等统计口径使用。
export function toPlainText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "<") {
      const tag = scanTag(text, i);
      if (tag) {
        i += tag.raw.length - 1;
        continue;
      }
    }
    out += text[i];
  }
  return decodeEntities(out);
}

// 各目标格式允许保留的内联标签；不在白名单内的标签去掉、保留其内部文本。
const SRT_TAGS = new Set(["i", "b", "u", "font"]);
const VTT_TAGS = new Set(["b", "i", "u", "ruby", "rt", "v", "c", "lang"]);
const ENTITY_REF = /^&(?:[A-Za-z]+|#\d+|#[xX][0-9A-Fa-f]+);/;

export function sanitizeMarkup(text: string, format: Format): string {
  const allowed = format === "vtt" ? VTT_TAGS : SRT_TAGS;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "<") {
      const tag = scanTag(text, i);
      if (tag) {
        const keep = tag.timestamp ? format === "vtt" : allowed.has(tag.name);
        if (keep) out += tag.raw;
        i += tag.raw.length - 1;
        continue;
      }
      // 未闭合或不合法的 "<"：VTT 必须转义，否则播放器会吞掉后续文本
      out += format === "vtt" ? "&lt;" : "<";
      continue;
    }
    if (ch === "&" && format === "vtt" && !ENTITY_REF.test(text.slice(i))) {
      out += "&amp;";
      continue;
    }
    out += ch;
  }
  return out;
}
