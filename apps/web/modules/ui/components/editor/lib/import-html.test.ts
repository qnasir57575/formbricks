// @vitest-environment jsdom
import { $generateHtmlFromNodes } from "@lexical/html";
import { $createLinkNode, $isLinkNode } from "@lexical/link";
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $dfs } from "@lexical/utils";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type LexicalEditor,
  createEditor,
} from "lexical";
import { describe, expect, test } from "vitest";
import { md } from "@/lib/markdownIt";
import { EDITOR_NODES } from "../components/editor-nodes";
import { exampleTheme } from "./example-theme";
import { toEditorOutputHtml } from "./exported-html";
import { $setRootFromHtml } from "./import-html";

// The markup from the report (formbricks#7629): language links for a welcome card.
const ISSUE_HTML_LINES = [
  "<p>",
  '  <a href="/s/SURVEY_ID?lang=ro">Romanian</a><br/>',
  '  <a href="/s/SURVEY_ID?lang=en">English</a><br/>',
  '  <a href="/s/SURVEY_ID?lang=uk">Ukrainian</a>',
  "</p>",
];
const ISSUE_LINK_URLS = ["/s/SURVEY_ID?lang=ro", "/s/SURVEY_ID?lang=en", "/s/SURVEY_ID?lang=uk"];

const createTestEditor = (): LexicalEditor =>
  createEditor({
    namespace: "import-html-test",
    theme: exampleTheme,
    nodes: EDITOR_NODES,
    onError: (error) => {
      throw error;
    },
  });

const exportStored = (editor: LexicalEditor): string =>
  toEditorOutputHtml(editor.getEditorState().read(() => $generateHtmlFromNodes(editor)));

/** What a field stores once someone types `lines` into the editor, one per line (Shift+Enter). */
const storeTypedLines = (lines: string[]): string => {
  const editor = createTestEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      lines.forEach((line, index) => {
        if (index > 0) paragraph.append($createLineBreakNode());
        paragraph.append($createTextNode(line));
      });
      $getRoot().append(paragraph);
    },
    { discrete: true }
  );
  return exportStored(editor);
};

/** Opens a stored value in a fresh editor the way `LocalizedEditor` does: through markdown-it first. */
const openInEditor = (stored: string) => {
  const editor = createTestEditor();
  editor.update(() => $setRootFromHtml(editor, md.render(stored)), { discrete: true });
  return editor.getEditorState().read(() => ({
    editor,
    inlineRootChildren: $getRoot()
      .getChildren()
      .filter((node) => node.isInline())
      .map((node) => node.getType()),
    text: $getRoot().getTextContent(),
    linkUrls: $dfs()
      .map(({ node }) => node)
      .filter($isLinkNode)
      .map((link) => link.getURL()),
  }));
};

describe("$setRootFromHtml", () => {
  test("opens a welcome card whose text has the reported HTML typed between other lines (#7629)", () => {
    // The HTML on its own opens (see below); it breaks once content follows its `</p>` in the same
    // paragraph, here the line typed after it.
    const stored = storeTypedLines(["Choose a language:", ...ISSUE_HTML_LINES, "Thank you!"]);

    const opened = openInEditor(stored);

    expect(opened.inlineRootChildren).toEqual([]);
    expect(opened.linkUrls).toEqual(ISSUE_LINK_URLS);
    for (const text of ["Choose a language:", "Romanian", "English", "Ukrainian", "Thank you!"]) {
      expect(opened.text).toContain(text);
    }
  });

  test("opens HTML set through the API with text on both sides of a block tag", () => {
    const opened = openInEditor(`Choose: ${ISSUE_HTML_LINES.join("")} Thanks!`);

    expect(opened.inlineRootChildren).toEqual([]);
    expect(opened.linkUrls).toEqual(ISSUE_LINK_URLS);
    expect(opened.text).toContain("Choose:");
    expect(opened.text).toContain("Thanks!");
  });

  test("puts a link that follows a block tag into a paragraph instead of directly under the root", () => {
    const opened = openInEditor(
      storeTypedLines(['<div>Choose a language:</div><a href="/s/SURVEY_ID?lang=ro">Romanian</a>'])
    );

    expect(opened.inlineRootChildren).toEqual([]);
    expect(opened.linkUrls).toEqual(["/s/SURVEY_ID?lang=ro"]);
    expect(opened.text).toContain("Romanian");
  });

  test("keeps the reported HTML as one paragraph of links when it is stored on its own", () => {
    const opened = openInEditor(ISSUE_HTML_LINES.join("\n"));

    expect(opened.inlineRootChildren).toEqual([]);
    expect(opened.editor.getEditorState().read(() => $getRoot().getChildrenSize())).toBe(1);
    expect(opened.linkUrls).toEqual(ISSUE_LINK_URLS);
  });

  test("reopens the editor's own formatting, links and lists unchanged", () => {
    const editor = createTestEditor();
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createTextNode("Bold").toggleFormat("bold"),
            $createTextNode(" and "),
            $createTextNode("italic").toggleFormat("italic"),
            $createLineBreakNode(),
            $createLinkNode("https://formbricks.com").append($createTextNode("a link"))
          ),
          $createListNode("bullet").append($createListItemNode().append($createTextNode("An item")))
        );
      },
      { discrete: true }
    );
    const stored = exportStored(editor);

    expect(exportStored(openInEditor(stored).editor)).toBe(stored);
  });
});
