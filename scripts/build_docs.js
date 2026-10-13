// Builds the docs site: one self-contained site/index.html from DOCUMENTATION.md,
// with a sidebar of its sections. Run with `yarn docs:build`.
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "site");
const markdown = fs.readFileSync(path.join(root, "DOCUMENTATION.md"), "utf-8");
const { version } = require(path.join(root, "apps", "cli", "package.json"));

const stripTags = (html) => html.replace(/<[^>]+>/g, "");
const decode = (text) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

// GitHub's anchor rule, so the document's own `#links` keep working.
function slug(text, seen) {
  const base = decode(stripTags(text))
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

const toc = [];
const seen = new Map();
const renderer = new marked.Renderer();
renderer.heading = (text, level) => {
  const id = slug(text, seen);
  if ((level === 2 || level === 3) && stripTags(text) !== "Contents") {
    toc.push({ id, level, text });
  }
  return `<h${level} id="${id}"><a class="anchor" href="#${id}">${text}</a></h${level}>\n`;
};

const body = marked.parse(markdown, { renderer, gfm: true });
const tocHtml = toc
  .map(
    ({ id, level, text }) =>
      `<li class="toc-${level}"><a href="#${id}">${text}</a></li>`
  )
  .join("\n");

const css = `
:root {
  --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --border: #d1d9e0;
  --code-bg: #f6f8fa; --link: #0969da; --sidebar-bg: #f6f8fa;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --border: #3d444d;
    --code-bg: #161b22; --link: #4493f8; --sidebar-bg: #010409;
  }
}
* { box-sizing: border-box; }
html { scroll-padding-top: 16px; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.layout { display: flex; min-height: 100vh; }
nav {
  position: sticky; top: 0; align-self: flex-start; height: 100vh; overflow-y: auto;
  width: 280px; flex-shrink: 0; padding: 24px 16px; background: var(--sidebar-bg);
  border-right: 1px solid var(--border); font-size: 14px;
}
nav .title { font-weight: 600; font-size: 18px; margin-bottom: 4px; }
nav .version { color: var(--muted); margin-bottom: 16px; }
nav ul { list-style: none; margin: 0; padding: 0; }
nav li { margin: 2px 0; }
nav .toc-2 { font-weight: 600; margin-top: 12px; }
nav .toc-3 { padding-left: 12px; }
nav summary { display: none; }
main { flex: 1; min-width: 0; max-width: 900px; padding: 24px 40px 80px; }
h1, h2, h3 { line-height: 1.25; margin: 1.6em 0 0.6em; }
h1 { font-size: 2em; margin-top: 0; }
h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.2em; }
h1 a.anchor, h2 a.anchor, h3 a.anchor, h4 a.anchor { color: inherit; }
code {
  font: 0.875em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--code-bg); padding: 0.15em 0.35em; border-radius: 4px;
}
pre { background: var(--code-bg); padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
pre code { padding: 0; background: none; }
table { border-collapse: collapse; display: block; overflow-x: auto; margin: 1em 0; }
th, td { border: 1px solid var(--border); padding: 6px 12px; text-align: left; vertical-align: top; }
th { background: var(--code-bg); }
blockquote { margin: 1em 0; padding: 0 1em; color: var(--muted); border-left: 4px solid var(--border); }
hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }
@media (max-width: 800px) {
  .layout { display: block; }
  nav { position: static; width: auto; height: auto; border-right: 0; border-bottom: 1px solid var(--border); padding: 12px 16px; }
  nav summary { display: list-item; cursor: pointer; font-weight: 600; }
  nav .title, nav .version { display: none; }
  main { padding: 16px; }
}
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Charcoal command reference</title>
<style>${css}</style>
</head>
<body>
<div class="layout">
<nav>
<div class="title">Charcoal</div>
<div class="version">v${version} · <a href="https://github.com/fbarretto/charcoal">GitHub</a></div>
<details open>
<summary>Contents</summary>
<ul>
${tocHtml}
</ul>
</details>
</nav>
<main>
${body}
</main>
</div>
<script>
// The table of contents starts collapsed on phones.
if (window.matchMedia('(max-width: 800px)').matches) {
  document.querySelector('nav details').removeAttribute('open');
}
</script>
</body>
</html>
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(
  `Wrote ${path.relative(root, path.join(outDir, "index.html"))} (${
    toc.length
  } sections).`
);
