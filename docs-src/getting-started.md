---
title: Getting Started
description: How to set up docs-server for your project
---

# Getting Started

Install docs-server as a dev dependency:

```bash
bun add -d docs-server
```

## Configuration

Create a `docs-server.config.ts` in your project root:

```typescript
export default {
  title: 'My Library',
  baseUrl: '/',
  nav: ['index', 'getting-started'],
}
```

## Writing Content

Create markdown files in `docs-src/` with frontmatter:

```markdown
---
title: My Page
---

# My Page Content
```

## Callouts

{% callout type="tip" title="Hot tip" %}
Use `bun run dev` during development for live reload.
{% /callout %}

{% callout type="warning" %}
Make sure your `docs-src/layout.html` exists before running a build.
{% /callout %}
