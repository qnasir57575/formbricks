import { $generateNodesFromDOM } from "@lexical/html";
import {
  $createParagraphNode,
  $getRoot,
  $isDecoratorNode,
  $isElementNode,
  type LexicalEditor,
  type LexicalNode,
  type ParagraphNode,
} from "lexical";

/** Whether the root can hold the node as it is: a block element or a block decorator. */
const $isBlockLevelNode = (node: LexicalNode): boolean =>
  ($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline();

/**
 * Replaces the editor's content with the nodes parsed from `html`, the markup a rich-text field stores.
 * Call it inside `editor.update`.
 *
 * `$generateNodesFromDOM` turns inline content sitting directly in `<body>` into top-level text,
 * line-break and link nodes, but the root holds only blocks: a text or line-break node there throws
 * Lexical error #282. Stored markup ends up like that when it has a block tag inside a paragraph, since
 * the HTML parser closes the paragraph at that tag and whatever follows lands in `<body>`. The editor
 * stores the `<` and `>` someone types decoded, so HTML typed into a field does this (#7629), as does
 * HTML set through the API. Each run of such inline nodes goes into a paragraph of its own, keeping its
 * text, formatting, links and line breaks.
 */
export const $setRootFromHtml = (editor: LexicalEditor, html: string): void => {
  const dom = new DOMParser().parseFromString(html, "text/html");

  const blocks: LexicalNode[] = [];
  let runParagraph: ParagraphNode | null = null;
  for (const node of $generateNodesFromDOM(editor, dom)) {
    if ($isBlockLevelNode(node)) {
      blocks.push(node);
      runParagraph = null;
      continue;
    }
    if (runParagraph === null) {
      runParagraph = $createParagraphNode();
      blocks.push(runParagraph);
    }
    runParagraph.append(node);
  }

  const root = $getRoot();
  root.clear();
  root.append(...blocks);
};
