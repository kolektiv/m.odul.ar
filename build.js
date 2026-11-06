// Builds _site/ from the Markdown files in posts/ and the templates in templates/:
// the page itself, and an Atom feed of the same posts.
//
// Posts are named YYYY-MM-DD-slug.md and start with a "# Title" line, which
// can be followed by a line of #tags.

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";

const root = import.meta.dirname;
const out = join(root, "_site");
const assets = ["media"];
const origin = "https://m.odul.ar";

// The stylesheet's name includes a hash of its contents, so every change gets
// a new URL that no browser or Cloudflare cache holds an old copy of.
const css = readFileSync(join(root, "style.css"));
const stylesheet = `/style.${createHash("sha256").update(css).digest("hex").slice(0, 10)}.css`;

const videos = /\.(mp4|webm|mov)$/i;

const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const formatDate = (date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(date));

const timestamp = (date) => `${date}T00:00:00Z`;

// Fills a template's {{ name }} placeholders. A placeholder with no value is
// an error, so typos fail the build instead of publishing.
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
    // An image opens full size in a new tab, and its link says so to screen
    // readers. A decorative image, with empty alt text, isn't linked, so screen
    // readers can skip it.
    paragraph({ tokens }) {
      if (tokens.length !== 1 || tokens[0].type !== "image") return false;
      const [media] = tokens;
      const alt = escape(this.parser.parseInline(media.tokens, this.parser.textRenderer));
      const caption = media.title ? `\n  <figcaption>${escape(media.title)}</figcaption>` : "";
      const body =
        videos.test(media.href) || !alt
          ? this.image(media)
          : `<a href="${escape(media.href)}" target="_blank" aria-label="${alt} (full size, opens in new tab)">${this.image(media)}</a>`;
      return `<figure>\n  ${body}${caption}\n</figure>\n`;
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
    const [, title, rest] = content;

    // The first line after the title is tags if it holds nothing else, like "#ui #dsp".
    const tagLine = rest.match(/^\s*((?:#[a-z0-9-]+[ \t]*)+)(?:\r?\n|$)/i);
    const tags = tagLine ? [...new Set(tagLine[1].toLowerCase().match(/[a-z0-9-]+/g))] : [];
    const body = tagLine ? rest.slice(tagLine[0].length) : rest;

    return { slug, date, title: marked.parseInline(title), tags, content: marked.parse(body).trimEnd() };
  });

// Each tag links to the page filtered by it. The list is named for screen
// readers, and role="list" keeps it a list in Safari once its bullets are gone.
const tagList = (tags) =>
  tags.length
    ? `<ul class="tags" role="list" aria-label="Tags">${tags
        .map((tag) => `<li><a class="p-category" href="/?tag=${tag}">${tag}</a></li>`)
        .join("")}</ul>`
    : "";

const page = render("page.html", {
  stylesheet,
  posts: posts
    .map((post) =>
      render("post.html", {
        slug: post.slug,
        title: post.title,
        date: formatDate(post.date),
        datetime: post.date,
        tags: tagList(post.tags),
        content: post.content,
      }),
    )
    .join("\n\n"),
});

// Feed readers show posts away from the site, so links and images that start
// at the site root need its full address.
const absolute = (html) => html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${origin}/`);

const feed = render("feed.xml", {
  updated: timestamp(posts[0]?.date ?? new Date().toISOString().slice(0, 10)),
  entries: posts
    .map((post) =>
      render("entry.xml", {
        slug: post.slug,
        datetime: post.date,
        timestamp: timestamp(post.date),
        title: escape(post.title),
        categories: post.tags.map((tag) => `<category term="${tag}"/>`).join("\n    "),
        content: escape(absolute(post.content)),
      }),
    )
    .join("\n"),
});

rmSync(out, { recursive: true, force: true });
mkdirSync(out);

for (const asset of assets) {
  if (existsSync(join(root, asset))) cpSync(join(root, asset), join(out, asset), { recursive: true });
}

writeFileSync(join(out, stylesheet), css);
writeFileSync(join(out, "index.html"), `${page}\n`);
writeFileSync(join(out, "feed.xml"), `${feed}\n`);

console.log(`Built ${posts.length} post${posts.length === 1 ? "" : "s"} into _site/`);
