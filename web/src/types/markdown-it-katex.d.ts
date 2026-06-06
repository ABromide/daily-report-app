declare module "markdown-it-katex" {
  import type MarkdownIt from "markdown-it";

  const markdownItKatex: MarkdownIt.PluginSimple | MarkdownIt.PluginWithOptions<Record<string, unknown>>;
  export default markdownItKatex;
}
