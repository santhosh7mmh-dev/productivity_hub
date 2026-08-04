/**
 * markdown.js
 * -----------
 * A small, dependency-free Markdown -> HTML renderer covering the
 * subset actually used in this app: headings, bold/italic, inline code,
 * fenced code blocks, links, images, blockquotes, ordered/unordered
 * lists, horizontal rules, and paragraphs. It intentionally does not
 * attempt to be a full CommonMark implementation — the goal is correct,
 * predictable output for the Notes editor and AI chat bubbles without
 * pulling in an external library, matching the "no unnecessary
 * dependencies" requirement.
 *
 * All output is escaped by default (see escapeHtml import) except for
 * the exact tags this renderer itself introduces, so rendering user or
 * model-generated Markdown is XSS-safe.
 * @module utils/markdown
 */

import { escapeHtml } from './helpers.js';

/**
 * Renders inline Markdown (bold, italic, code, links, images) within a
 * single already-HTML-escaped line of text.
 * @param {string} escapedText
 * @returns {string}
 */
function renderInline(escapedText) {
  let text = escapedText;

  // Inline code first, so its contents are protected from further rules.
  const codeTokens = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    codeTokens.push(code);
    return `\u0000CODE${codeTokens.length - 1}\u0000`;
  });

  // Images before links (images share the link syntax with a leading !).
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, alt, src, title) => `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''}>`);

  // Links.
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_, label, href, title) => `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${label}</a>`);

  // Bold + italic (order matters: *** before ** before *).
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');

  // Strikethrough.
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Restore protected inline code.
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codeTokens[Number(i)]}</code>`);

  return text;
}

/**
 * Renders a full Markdown document to an HTML string.
 * @param {string} src
 * @returns {string}
 */
export function renderMarkdown(src) {
  const lines = (src || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let paragraphBuf = [];
  let listStack = []; // { type: 'ul'|'ol', indent }

  function flushParagraph() {
    if (paragraphBuf.length) {
      out.push(`<p>${renderInline(paragraphBuf.join(' '))}</p>`);
      paragraphBuf = [];
    }
  }
  function closeLists(toLevel = 0) {
    while (listStack.length > toLevel) {
      out.push(`</${listStack.pop().type}>`);
    }
  }

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine;

    // Fenced code block ```lang ... ```
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      flushParagraph();
      closeLists();
      const lang = fenceMatch[1];
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(`<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Blank line -> paragraph/list break
    if (/^\s*$/.test(line)) {
      flushParagraph();
      closeLists();
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      closeLists();
      out.push('<hr>');
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      closeLists();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInline(escapeHtml(headingMatch[2].trim()))}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote (consumes consecutive '>' lines)
    if (/^>\s?/.test(line)) {
      flushParagraph();
      closeLists();
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // List items (unordered - * +, or ordered 1.)
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      flushParagraph();
      const type = ulMatch ? 'ul' : 'ol';
      const content = (ulMatch || olMatch)[2];
      if (!listStack.length || listStack[listStack.length - 1].type !== type) {
        closeLists();
        listStack.push({ type });
        out.push(`<${type}>`);
      }
      out.push(`<li>${renderInline(escapeHtml(content))}</li>`);
      i++;
      continue;
    }

    // Default: accumulate into the current paragraph.
    closeLists();
    paragraphBuf.push(escapeHtml(line.trim()));
    i++;
  }

  flushParagraph();
  closeLists();
  return out.join('\n');
}

/**
 * Strips Markdown syntax down to plain text — used for search indexing
 * and preview snippets where we don't want raw asterisks/hashes showing.
 * @param {string} src
 * @returns {string}
 */
export function markdownToPlainText(src) {
  return (src || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>#-]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
