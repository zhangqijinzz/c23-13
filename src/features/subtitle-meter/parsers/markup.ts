import type { Format } from "../models";

export type MarkupNode =
  | { type: "text"; value: string }
  | { type: "newline" }
  | { type: "timestamp"; value: string }
  | {
      type: "element";
      tag: string;
      classes?: string[];
      attributes?: Record<string, string>;
      voice?: string;
      lang?: string;
      children: MarkupNode[];
    };

type MutableElement = Exclude<Extract<MarkupNode, { type: "element" }>, never>;

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function parseMarkup(raw: string): MarkupNode[] {
  const root: MarkupNode[] = [];
  const stack: MutableElement[] = [];

  const pushNode = (node: MarkupNode) => {
    const parent = stack.at(-1);
    if (parent) parent.children.push(node);
    else root.push(node);
  };

  let position = 0;
  while (position < raw.length) {
    const nextTag = raw.indexOf("<", position);
    if (nextTag < 0) {
      appendText(pushNode, raw.slice(position));
      break;
    }

    if (nextTag > position) {
      appendText(pushNode, raw.slice(position, nextTag));
    }

    const closeTag = raw.indexOf(">", nextTag + 1);
    if (closeTag < 0) {
      appendText(pushNode, raw.slice(nextTag));
      break;
    }

    const token = raw.slice(nextTag + 1, closeTag).trim();
    position = closeTag + 1;
    if (!token || token.includes("<")) continue;

    if (token.startsWith("/")) {
      const tag = token
        .slice(1)
        .split(/[\s.][^]*$/)[0]
        ?.toLowerCase();
      if (!tag) continue;

      let openIndex = -1;
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index]?.tag === tag) {
          openIndex = index;
          break;
        }
      }
      if (openIndex >= 0) {
        const reopened = stack.slice(openIndex + 1);
        stack.length = openIndex;
        reopened.forEach((element) => {
          const clone = cloneElement(element);
          pushNode(clone);
          stack.push(clone);
        });
      }
      continue;
    }

    const timestamp = parseTimestampToken(token);
    if (timestamp) {
      pushNode({ type: "timestamp", value: timestamp });
      continue;
    }

    addOpeningTag(token, pushNode, stack);
  }

  return root;
}

export function serializeMarkup(nodes: MarkupNode[], format: Format): string {
  return serializeNodes(nodes, format, [])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function getVisibleText(nodes: MarkupNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.value;
      if (node.type === "newline") return "\n";
      if (node.type === "timestamp") return "";
      if (node.tag === "rp") return "";
      return getVisibleText(node.children);
    })
    .join("");
}

export function parsePlainText(text: string): MarkupNode[] {
  const nodes: MarkupNode[] = [];
  for (const [lineIndex, line] of text.split("\n").entries()) {
    if (lineIndex > 0) nodes.push({ type: "newline" });
    if (line) nodes.push({ type: "text", value: line });
  }
  return nodes;
}

function cloneElement(element: MutableElement): MutableElement {
  return { ...element, children: [] };
}

function appendText(pushNode: (node: MarkupNode) => void, value: string) {
  const parts = value.split("\n");
  parts.forEach((part, index) => {
    if (index > 0) pushNode({ type: "newline" });
    const decoded = decodeEntities(part);
    if (decoded) pushNode({ type: "text", value: decoded });
  });
}

function addOpeningTag(
  token: string,
  pushNode: (node: MarkupNode) => void,
  stack: MutableElement[],
) {
  const definition = parseOpeningToken(token);
  if (!definition) return;

  if (definition.tag === "br") {
    pushNode({ type: "newline" });
    return;
  }

  if (definition.tag === "ruby" && stack.some((node) => node.tag === "ruby"))
    return;
  if (definition.tag === "v" && stack.some((node) => node.tag === "v")) return;

  if (
    ["rt", "rp"].includes(definition.tag) &&
    !stack.some((node) => node.tag === "ruby")
  )
    return;

  const element: MutableElement = {
    type: "element",
    tag: definition.tag,
    children: [],
  };
  if (definition.classes.length) element.classes = definition.classes;
  if (definition.attributes && Object.keys(definition.attributes).length)
    element.attributes = definition.attributes;
  if (definition.voice !== undefined) element.voice = definition.voice;
  if (definition.lang !== undefined) element.lang = definition.lang;

  pushNode(element);
  if (!voidTags.includes(definition.tag) && !definition.selfClose)
    stack.push(element);
}

const voidTags = ["br"];

interface OpeningDefinition {
  tag: string;
  classes: string[];
  attributes: Record<string, string>;
  voice?: string;
  lang?: string;
  selfClose: boolean;
}

function parseOpeningToken(token: string): OpeningDefinition | null {
  const selfClose = /\/\s*$/.test(token);
  const normalized = token
    .replace(/\s+\/$/, "")
    .replace(/^([a-z][a-z0-9]*)\/$/i, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const dotIndex = normalized.search(/[.\s]/);
  const tag = (
    dotIndex < 0 ? normalized : normalized.slice(0, dotIndex)
  ).toLowerCase();
  if (!/^[a-z][a-z0-9]*$/.test(tag)) return null;

  if (["br", "b", "i", "u", "ruby", "rt", "rp"].includes(tag)) {
    return {
      tag,
      classes: tokenClasses(normalized),
      attributes: {},
      selfClose,
    };
  }

  if (tag === "c" || tag === "span") {
    return {
      tag: "c",
      classes: tokenClasses(normalized),
      attributes: {},
      selfClose,
    };
  }

  if (tag === "lang") {
    return {
      tag,
      classes: tokenClasses(normalized),
      attributes: {},
      lang: normalized.match(/^lang(?:\.[^ ]+)?\s+(\S+)/)?.[1] ?? "",
      selfClose,
    };
  }

  if (tag === "v") {
    const dotClasses =
      normalized
        .match(/^v(?:\.([^ ]+))?/)?.[1]
        ?.split(".")
        .filter(Boolean) ?? [];
    const labelMatch = normalized.match(/^v(?:\.[^ ]+)?\s+([^]*)$/);
    return {
      tag,
      classes: dotClasses,
      attributes: {},
      voice: labelMatch?.[1]?.trim() ?? "",
      selfClose,
    };
  }

  if (tag === "font") {
    const attributes = ["color", "face", "size"].reduce<Record<string, string>>(
      (result, name) => {
        const value = getAttribute(normalized, name);
        if (value !== undefined) result[name] = value;
        return result;
      },
      {},
    );
    return { tag, classes: [], attributes, selfClose };
  }

  return null;
}

function getAttribute(token: string, name: string): string | undefined {
  const match = token.match(
    new RegExp(`\\s+${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function tokenClasses(token: string): string[] {
  const attributeClasses =
    getAttribute(token, "class")?.split(/\s+/).filter(Boolean) ?? [];
  return [...new Set([...parseClasses(token), ...attributeClasses])];
}

function parseClasses(token: string): string[] {
  const separator = token.indexOf(".");
  if (separator < 0) return [];
  return (
    token
      .slice(separator + 1)
      .split(/\s+/)[0]
      ?.split(".")
      .filter(Boolean) ?? []
  );
}

function parseTimestampToken(token: string): string | null {
  const hours = "(?:\\d+:)?[0-5]?\\d:[0-5]?\\d\\.\\d{1,3}";
  return new RegExp(
    `^(?:${hours}|\\d{1,}:[0-5]?\\d:[0-5]?\\d\\.\\d{1,3})$`,
  ).test(token)
    ? token
    : null;
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi,
    (entity, code: string) => {
      if (code[0] === "#") {
        const codepoint =
          code[1]?.toLowerCase() === "x"
            ? parseInt(code.slice(2), 16)
            : Number(code.slice(1));
        return Number.isInteger(codepoint) &&
          codepoint > 0 &&
          codepoint <= 0x10ffff
          ? String.fromCodePoint(codepoint)
          : entity;
      }
      return namedEntities[code.toLowerCase()] ?? entity;
    },
  );
}

function serializeNodes(
  nodes: MarkupNode[],
  format: Format,
  openStack: MutableElement[],
): string {
  let output = "";
  const stack = [...openStack];

  for (const node of nodes) {
    if (node.type === "text") {
      output += escapeText(node.value, format);
    } else if (node.type === "newline") {
      output += "\n";
    } else if (node.type === "timestamp") {
      if (format === "vtt") output += `<${node.value}>`;
    } else if (format === "srt" && node.tag === "rp") {
      // SRT 没有 ruby 模型，括号属于辅助层，不进入目标格式。
    } else if (format === "srt" && node.tag === "rt") {
      output += "（";
      output += serializeNodes(node.children, format, stack);
      output += "）";
    } else {
      const serializedTag = getSerializedTag(node.tag, format);
      if (serializedTag) {
        output += openingTag(node, format);
        stack.push(node);
        output += serializeNodes(node.children, format, stack);
        while (stack.at(-1) !== node) stack.pop();
        output += `</${serializedTag}>`;
        stack.pop();
      } else {
        output += serializeNodes(node.children, format, stack);
      }
    }
  }

  return output;
}

function getSerializedTag(tag: string, format: Format): string | null {
  if (["b", "i", "u", "br"].includes(tag)) return tag;
  if (tag === "c") return format === "vtt" ? "c" : null;
  if (tag === "lang" || tag === "v") return format === "vtt" ? tag : null;
  if (["ruby", "rt", "rp"].includes(tag)) return format === "vtt" ? tag : null;
  if (tag === "font") return format === "srt" ? "font" : null;
  return null;
}

function openingTag(element: MutableElement, format: Format): string {
  const tag = getSerializedTag(element.tag, format);
  if (!tag) return "";

  if (tag === "font" && format === "srt") {
    const attributes = ["color", "face", "size"]
      .map((name) =>
        element.attributes?.[name] !== undefined
          ? ` ${name}="${escapeAttribute(element.attributes[name]!, format)}"`
          : "",
      )
      .join("");
    return `<font${attributes}>`;
  }

  const classes = element.classes?.length
    ? `.${element.classes.join(".")}`
    : "";
  if (tag === "v")
    return `<v${classes}${element.voice ? ` ${element.voice}` : ""}>`;
  if (tag === "lang")
    return `<lang${classes}${element.lang ? ` ${element.lang}` : ""}>`;
  return `<${tag}${format === "vtt" ? classes : ""}>`;
}

function escapeText(value: string, format: Format): string {
  if (format === "srt") return value;
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string, format: Format): string {
  if (format === "srt") return value.replace(/"/g, "&quot;");
  return escapeText(value, format).replace(/"/g, "&quot;");
}
