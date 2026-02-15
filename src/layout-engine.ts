import type { PageData } from "./markdoc-pipeline.ts";

export interface RenderOptions {
  title: string;
  baseUrl: string;
  navHtml: string;
  cssPath?: string;
  jsPath?: string;
  isDev?: boolean;
}

export function renderPage(
  page: PageData,
  layoutHtml: string,
  options: RenderOptions,
): string {
  const pageTitle = page.frontmatter.title
    ? `${page.frontmatter.title} — ${options.title}`
    : options.title;

  let html = layoutHtml
    .replace("<!-- content -->", page.content)
    .replace("<!-- menu -->", options.navHtml)
    .replace("<!-- title -->", pageTitle);

  // Auto-inject <title> into <head> if not present
  if (!html.includes("<title>")) {
    html = html.replace("</head>", `  <title>${pageTitle}</title>\n</head>`);
  }

  // Inject CSS before </head>
  if (options.cssPath) {
    const cssTag = `  <link rel="stylesheet" href="${options.baseUrl}${options.cssPath}">\n`;
    html = html.replace("</head>", `${cssTag}</head>`);
  }

  // Inject JS before </body>
  if (options.jsPath) {
    const jsTag = `  <script type="module" src="${options.baseUrl}${options.jsPath}"></script>\n`;
    html = html.replace("</body>", `${jsTag}</body>`);
  }

  // Inject meta description if present
  if (page.frontmatter.description) {
    const metaTag = `  <meta name="description" content="${escapeAttr(page.frontmatter.description)}">\n`;
    html = html.replace("</head>", `${metaTag}</head>`);
  }

  return html;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function generateNavHtml(
  pages: { slug: string; title: string }[],
  navOrder: string[],
  baseUrl: string,
): string {
  // Separate regular pages from API pages
  const regularPages = pages.filter(
    (p) => !p.slug.startsWith("api/") && p.slug !== "api",
  );
  const apiPages = pages.filter(
    (p) => p.slug.startsWith("api/") || p.slug === "api",
  );

  // Order regular pages according to nav config, then include remaining
  const ordered = navOrder
    .filter((name) => name !== "api")
    .map((name) =>
      regularPages.find(
        (p) => p.slug === name || (name === "index" && p.slug === ""),
      ),
    )
    .filter(Boolean) as { slug: string; title: string }[];

  const remaining = regularPages.filter(
    (p) =>
      !navOrder.includes(p.slug) &&
      !navOrder.includes(p.slug === "" ? "index" : p.slug),
  );

  const regularItems = [...ordered, ...remaining];

  const lines: string[] = [];
  for (const p of regularItems) {
    const href = p.slug === "" ? `${baseUrl}` : `${baseUrl}${p.slug}/`;
    lines.push(`    <li><a href="${href}">${escapeAttr(p.title)}</a></li>`);
  }

  // Group API pages by category (second path segment)
  if (apiPages.length > 0) {
    const apiGroups = groupApiPages(apiPages);
    const apiPosition = navOrder.indexOf("api");

    const apiHtml = renderApiNav(apiGroups, baseUrl);

    if (apiPosition >= 0) {
      // Insert API section at configured position
      lines.splice(apiPosition, 0, apiHtml);
    } else {
      lines.push(apiHtml);
    }
  }

  return `<nav>\n  <ul>\n${lines.join("\n")}\n  </ul>\n</nav>`;
}

interface ApiGroup {
  category: string;
  label: string;
  pages: { slug: string; title: string }[];
}

function groupApiPages(pages: { slug: string; title: string }[]): ApiGroup[] {
  const groups = new Map<string, { slug: string; title: string }[]>();

  for (const page of pages) {
    // Extract category from slug: "api/classes/MyClass" → "classes"
    const parts = page.slug.split("/");
    const category = parts.length > 1 ? parts[1] : "overview";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(page);
  }

  // Sort categories in a logical order
  const categoryOrder = [
    "overview",
    "classes",
    "interfaces",
    "functions",
    "type-aliases",
    "variables",
    "enumerations",
  ];
  const sorted = [...groups.entries()].sort(([a], [b]) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return sorted.map(([category, pages]) => ({
    category,
    label: formatCategoryLabel(category),
    pages: pages.sort((a, b) => a.title.localeCompare(b.title)),
  }));
}

function formatCategoryLabel(category: string): string {
  return category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderApiNav(groups: ApiGroup[], baseUrl: string): string {
  const lines: string[] = [];
  lines.push(`    <li>`);
  lines.push(`      <details>`);
  lines.push(`        <summary>API Reference</summary>`);
  lines.push(`        <ul>`);

  for (const group of groups) {
    if (group.pages.length === 1 && group.category === "overview") {
      const p = group.pages[0];
      const href = `${baseUrl}${p.slug}/`;
      lines.push(
        `          <li><a href="${href}">${escapeAttr(p.title)}</a></li>`,
      );
      continue;
    }

    lines.push(`          <li>`);
    lines.push(`            <details>`);
    lines.push(`              <summary>${escapeAttr(group.label)}</summary>`);
    lines.push(`              <ul>`);
    for (const p of group.pages) {
      const href = `${baseUrl}${p.slug}/`;
      lines.push(
        `                <li><a href="${href}">${escapeAttr(p.title)}</a></li>`,
      );
    }
    lines.push(`              </ul>`);
    lines.push(`            </details>`);
    lines.push(`          </li>`);
  }

  lines.push(`        </ul>`);
  lines.push(`      </details>`);
  lines.push(`    </li>`);
  return lines.join("\n");
}
