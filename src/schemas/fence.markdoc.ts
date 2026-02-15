import Markdoc, { type Node, type Schema, Tag } from "@markdoc/markdoc";

const fence: Schema = {
  attributes: {
    ...Markdoc.nodes.fence.attributes,
  },
  transform(node: Node) {
    const code = (node.attributes.content as string) || "";
    let language = (node.attributes.language as string) || "text";
    let filename: string | undefined;

    // Parse language and filename from info string (e.g., "html#filename.html")
    if (language.includes("#")) {
      const parts = language.split("#");
      language = parts[0];
      filename = parts[1];
    }

    // Determine if code should be collapsed (>10 lines)
    const collapsed = code.split("\n").length > 10;

    const metaChildren = filename
      ? [
          new Tag("span", { class: "file" }, [filename]),
          new Tag("span", { class: "language" }, [language]),
        ]
      : [new Tag("span", { class: "language" }, [language])];

    const codeblockAttrs: Record<string, unknown> = {
      language,
      ...(collapsed ? { collapsed: true } : {}),
    };

    const children: (Tag | string)[] = [
      new Tag("p", { class: "meta" }, metaChildren),
      new Tag("pre", { "data-language": language }, [
        new Tag("code", { class: `language-${language}` }, [code]),
      ]),
      new Tag(
        "basic-button",
        {
          class: "copy",
          "copy-success": "Copied!",
          "copy-error": "Error trying to copy to clipboard!",
        },
        [
          new Tag("button", { type: "button", class: "secondary small" }, [
            new Tag("span", { class: "label" }, ["Copy"]),
          ]),
        ],
      ),
    ];

    if (collapsed) {
      children.push(
        new Tag(
          "button",
          {
            type: "button",
            class: "overlay",
            "aria-expanded": "false",
          },
          ["Expand"],
        ),
      );
    }

    return new Tag("module-codeblock", codeblockAttrs, children);
  },
};

export default fence;
