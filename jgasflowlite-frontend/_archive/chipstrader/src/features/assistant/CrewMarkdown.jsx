import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { DOC_REF, docHref } from './crew';
import { formatCell } from './dataformat';

/**
 * A small, safe markdown renderer for crew answers. It builds React elements
 * (never innerHTML), so model output cannot inject markup. Supports headings,
 * paragraphs, bold, italics, inline and fenced code, lists, tables, quotes,
 * rules, http(s)/mailto links, and turns document numbers into links.
 */
export function CrewMarkdown({ text = '', onNavigate }) {
  return <div className="cc-md">{blocks(text, onNavigate)}</div>;
}

const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const numeric = (c) => /^[-+]?[\d.,\s]+(%|\s?[A-Z]{3})?$/.test(c.replace(/\*\*/g, '')) && /\d/.test(c);

function blocks(src, onNavigate) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  const key = () => out.length;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^```/.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(<pre key={key()}><code>{body.join('\n')}</code></pre>);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      const Tag = `h${h[1].length}`;
      out.push(<Tag key={key()}>{inline(h[2], onNavigate)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push(<hr key={key()} />); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        <div key={key()} className="cc-table-wrap cc-scroll">
          <table className="cc-table">
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, onNavigate)}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{head.map((_, j) => <td key={j} className={numeric(r[j] ?? '') ? 'num' : undefined}>{inline(formatCell(r[j] ?? ''), onNavigate)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(<blockquote key={key()}>{inline(body.join(' '), onNavigate)}</blockquote>);
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      // Indented bullets keep their depth, so record chains read as a tree.
      const items = [];
      const base = line.match(/^\s*/)[0].length;
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        const indent = lines[i].match(/^\s*/)[0].length;
        items.push({ depth: Math.min(Math.max(Math.round((indent - base) / 2), 0), 6), text: lines[i++].replace(/^\s*[-*•]\s+/, '') });
      }
      out.push(
        <ul key={key()}>
          {items.map((t, j) => <li key={j} data-depth={t.depth || undefined} style={t.depth ? { marginLeft: `${t.depth * 1.15}em` } : undefined}>{inline(t.text, onNavigate)}</li>)}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      out.push(<ol key={key()}>{items.map((t, j) => <li key={j}>{inline(t, onNavigate)}</li>)}</ol>);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|\s*[-*•]\s|\s*\d+[.)]\s|\s*>)/.test(lines[i]) && !(lines[i].includes('|') && isTableSep(lines[i + 1] ?? ''))) para.push(lines[i++]);
    out.push(<p key={key()}>{inline(para.join(' '), onNavigate)}</p>);
  }
  return out;
}

/** Inline markup: code, bold, italics, links, document references. */
function inline(text, onNavigate) {
  const parts = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(refs(text.slice(last, m.index), onNavigate, parts.length));
    const t = m[0];
    if (m[1]) parts.push(<code key={parts.length}>{t.slice(1, -1)}</code>);
    else if (m[2]) parts.push(<strong key={parts.length}>{refs(t.slice(2, -2), onNavigate, 0)}</strong>);
    else if (m[3]) parts.push(<em key={parts.length}>{t.slice(1, -1)}</em>);
    else {
      const [, label, url] = t.match(/\[([^\]]+)\]\(([^)\s]+)\)/);
      parts.push(/^(https?:|mailto:)/i.test(url)
        ? <a key={parts.length} href={url} target="_blank" rel="noreferrer noopener">{label}</a>
        : <Fragment key={parts.length}>{label}</Fragment>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(refs(text.slice(last), onNavigate, parts.length));
  return parts;
}

function refs(text, onNavigate, k) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(DOC_REF)) {
    const href = docHref(m[0]);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(href ? <Link key={`${k}-${m.index}`} to={href} className="cc-ref" onClick={onNavigate}>{m[0]}</Link> : m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment key={k}>{out}</Fragment>;
}
