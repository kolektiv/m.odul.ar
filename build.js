// Builds _site/ from the Markdown files in posts/ and the templates in templates/.
//
// Posts are named YYYY-MM-DD-slug.md and start with a "# Title" line.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";

const root = import.meta.dirname;
const out = join(root, "_site");
const assets = ["style.css", "media"];

const videos = /\.(mp4|webm|mov)$/i;

const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const formatDate = (date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(date));

// Fills a template's {{ name }} placeholders with HTML. A placeholder with no
// value is an error, so typos fail the build instead of publishing.
const render = (template, values) =>
  readFileSync(join(root, "templates", template), "utf8").trimEnd().replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`templates/${template}: no value for {{ ${name} }}`);
    return values[name];
  });

const marked = new Marked({
  renderer: {
    // A post's "# Title" becomes its h2, so "##" in the body becomes h3.
    heading({ tokens, depth }) {
      const level = Math.min(depth + 1, 6);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },

    // An image or video on its own line becomes a figure, captioned by its title.
    paragraph({ tokens }) {
      if (tokens.length !== 1 || tokens[0].type !== "image") return false;
      const { title } = tokens[0];
      const caption = title ? `\n  <figcaption>${escape(title)}</figcaption>` : "";
      return `<figure>\n  ${this.image(tokens[0])}${caption}\n</figure>\n`;
    },

    // ![alt](/media/x.jpg) is an image, ![alt](/media/x.mp4) is a video.
    image({ href, tokens }) {
      const alt = escape(this.parser.parseInline(tokens, this.parser.textRenderer));
      const src = escape(href);
      return videos.test(href)
        ? `<video src="${src}" aria-label="${alt}" controls playsinline preload="metadata"></video>`
        : `<img src="${src}" alt="${alt}" loading="lazy">`;
    },
  },
});

const posts = readdirSync(join(root, "posts"))
  .filter((file) => file.endsWith(".md"))
  .sort()
  .reverse()
  .map((file) => {
    const name = file.match(/^(\d{4}-\d{2}-\d{2})-([a-z0-9-]+)\.md$/);
    if (!name) throw new Error(`posts/${file}: name it YYYY-MM-DD-slug.md`);

    const source = readFileSync(join(root, "posts", file), "utf8");
    const content = source.match(/^# (.+)\r?\n([\s\S]*)$/);
    if (!content) throw new Error(`posts/${file}: start it with a "# Title" line`);

    const [, date, slug] = name;
    const [, title, body] = content;

    return render("post.html", {
      slug,
      title: marked.parseInline(title),
      date: formatDate(date),
      datetime: date,
      content: marked.parse(body).trimEnd(),
    });
  });

const page = render("page.html", { posts: posts.join("\n\n") });

rmSync(out, { recursive: true, force: true });
mkdirSync(out);

for (const asset of assets) {
  if (existsSync(join(root, asset))) cpSync(join(root, asset), join(out, asset), { recursive: true });
}

writeFileSync(join(out, "index.html"), `${page}\n`);

console.log(`Built ${posts.length} post${posts.length === 1 ? "" : "s"} into _site/`);
