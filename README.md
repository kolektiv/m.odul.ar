# m.odul.ar

Notes on building modular synth software, published at <https://m.odul.ar> with GitHub Pages.

Posts are Markdown files. On every push to `main`, a GitHub Actions workflow runs `build.js`, which renders them through the templates in `templates/` and publishes the result. The only dependency is [marked](https://marked.js.org).

## Writing a post

Add a file to `posts/` named `YYYY-MM-DD-slug.md`. The date and slug come from the name, and the first line is the title:

```markdown
# Title

Body text. Use `##` for subheadings.
```

Posts appear newest first on a single page. Each links to itself as `https://m.odul.ar/#slug`.

## Images and video

Put files in `media/` and reference them from the root. An image on a line of its own becomes a figure, and its title becomes the caption:

```markdown
![A patch](/media/patch.jpg "Optional caption")
```

The same syntax with an `.mp4`, `.webm` or `.mov` file becomes a video player. GitHub rejects files over 100 MB, so keep these short or host them elsewhere.

```markdown
![A demo](/media/demo.mp4 "Optional caption")
```

Raw HTML passes straight through, for anything Markdown can't express, such as a YouTube embed. The CSS sizes the frame to 16:9.

```html
<figure>
  <iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID" title="Describe the video" allow="fullscreen; picture-in-picture" loading="lazy"></iframe>
</figure>
```

## Templates

`templates/page.html` is the whole page, and `templates/post.html` is one post within it. Placeholders look like `{{ name }}` and are filled with HTML. A placeholder with no value stops the build with an error.

| Template    | Placeholder      | Filled with                                          |
| ----------- | ---------------- | ---------------------------------------------------- |
| `page.html` | `{{ posts }}`    | Every post, newest first                             |
| `post.html` | `{{ slug }}`     | The slug from the filename, such as `hello`          |
|             | `{{ title }}`    | The `# Title` line                                   |
|             | `{{ date }}`     | The date for reading, such as 6 November 2026        |
|             | `{{ datetime }}` | The date for machines, such as 2026-11-06            |
|             | `{{ content }}`  | The post body                                        |

## Preview locally

`.nix/flake.nix` provides Node 24, and `.envrc` loads it with direnv when you enter the directory. Without direnv, run `nix develop ./.nix` from the repository root.

Packages stay in the project. Dependencies go in `node_modules/`, and anything installed with `npm install -g` goes in `.npm/`.

Install, then start the dev server:

```sh
npm install
npm run dev
```

Open <http://localhost:8000>. Saving a post, a file in `media/`, a template, the CSS or `build.js` rebuilds the site and reloads the page. If a build fails, the error shows in the terminal and the last good build stays up. Set `PORT` to use a different port.

`npm run build` builds into `_site/` once, as the publish workflow does.
