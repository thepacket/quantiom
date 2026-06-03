import { type ReactNode, type CSSProperties } from "react";

/**
 * Tiny in-house markdown renderer (no runtime dependency). Handles
 * headings (#/##/###), paragraphs, fenced ``` ``` blocks, bulleted `-`
 * and numbered `1.` lists, horizontal rules (---), pipe tables, and the
 * inline transforms `code`, **bold**, *italic*. No links, images, or HTML.
 *
 * Shared by the Docs modal and the AI chat panel. Self-styled via inline
 * styles + CSS vars so it drops into any container.
 */
export function Markdown({ source }: { source: string }): ReactNode {
  const out: ReactNode[] = [];
  const lines = source.split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Code fence
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { buf.push(lines[i]); i++; }
      i++; // consume closing fence
      out.push(
        <pre key={key++} style={{ background: "var(--bg-alt, var(--bg-2))", padding: 10, borderRadius: 4, overflowX: "auto", fontSize: 12 }}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    // Horizontal rule
    if (/^-{3,}\s*$/.test(line)) { out.push(<hr key={key++} style={{ borderColor: "var(--border)" }} />); i++; continue; }
    // Headings
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      const sizes: Record<string, number> = { h1: 18, h2: 16, h3: 14 };
      out.push(
        // eslint-disable-next-line react/no-children-prop
        Reactish(tag, key++, { style: { fontSize: sizes[tag], marginTop: 16, marginBottom: 6 }, children: inline(h[2], key++) }),
      );
      i++;
      continue;
    }
    // Pipe table — accumulate consecutive | lines
    if (line.startsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) { tbl.push(lines[i]); i++; }
      out.push(renderTable(tbl, key++));
      continue;
    }
    // List (unordered or ordered)
    if (/^\s*-\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const isOrdered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*-\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]) || /^\s{2,}/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*(-|\d+\.)\s+/, ""));
        i++;
      }
      const Wrap = isOrdered ? "ol" : "ul";
      out.push(
        Reactish(Wrap, key++, {
          style: { marginTop: 4, marginBottom: 8, paddingLeft: 22 },
          children: items.map((item, idx) => <li key={idx}>{inline(item, key++)}</li>),
        }),
      );
      continue;
    }
    // Paragraph — consume non-blank lines until blank
    if (line.trim() === "") { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !lines[i].startsWith("```") && !lines[i].startsWith("|") && !/^\s*-\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^-{3,}\s*$/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    if (para.length > 0) {
      out.push(<p key={key++} style={{ margin: "6px 0" }}>{inline(para.join(" "), key++)}</p>);
    }
  }
  return <>{out}</>;
}

// Tiny helper so we don't have to repeat the createElement boilerplate.
function Reactish(tag: string, key: number, props: { style?: CSSProperties; children?: ReactNode }): ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = tag as any;
  return <Tag key={key} style={props.style}>{props.children}</Tag>;
}

function renderTable(rows: string[], key: number): ReactNode {
  const cells = rows.map((r) => r.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
  // Detect separator row (e.g. |---|---|) — drop it.
  const dataRows = cells.filter((row) => !row.every((c) => /^-+$/.test(c.replace(/:/g, ""))));
  if (dataRows.length === 0) return null;
  const [header, ...body] = dataRows;
  return (
    <table key={key} style={{ borderCollapse: "collapse", margin: "8px 0", fontSize: 12 }}>
      <thead>
        <tr>{header.map((c, i) => <th key={i} style={{ borderBottom: "1px solid var(--border)", padding: "4px 10px", textAlign: "left" }}>{inline(c, key * 100 + i)}</th>)}</tr>
      </thead>
      <tbody>
        {body.map((row, ri) => (
          <tr key={ri}>{row.map((c, ci) => <td key={ci} style={{ padding: "4px 10px", borderBottom: "1px solid var(--border)" }}>{inline(c, key * 1000 + ri * 10 + ci)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Apply inline transforms: `code`, **bold**, *italic*. Returns React nodes. */
function inline(text: string, baseKey: number): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0; let k = baseKey * 17;
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) nodes.push(text.slice(cursor, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) nodes.push(<code key={k++} style={{ background: "var(--bg-alt, var(--bg-2))", padding: "1px 4px", borderRadius: 3, fontSize: 12 }}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) nodes.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else nodes.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    cursor = m.index + tok.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}
