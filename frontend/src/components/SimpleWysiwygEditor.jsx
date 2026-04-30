import { useMemo, useState } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";

import {
  ClassicEditor,
  Alignment,
  Autoformat,
  BlockQuote,
  Bold,
  Essentials,
  FontColor,
  FontSize,
  Heading,
  Italic,
  Link,
  List,
  Paragraph,
  PasteFromOffice,
  Underline,
  Undo,
} from "ckeditor5";

import "ckeditor5/ckeditor5.css";

function SimpleWysiwygEditor({ label, defaultValue = "", max = 3000 }) {
  const [content, setContent] = useState(defaultValue);

  const editorConfig = useMemo(
    () => ({
      licenseKey: "GPL",

      plugins: [
        Essentials,
        Paragraph,
        Heading,
        Bold,
        Italic,
        Underline,
        FontSize,
        FontColor,
        Alignment,
        List,
        Link,
        BlockQuote,
        Autoformat,
        PasteFromOffice,
        Undo,
      ],

      toolbar: {
        items: [
          "undo",
          "redo",
          "|",
          "heading",
          "|",
          "bold",
          "italic",
          "underline",
          "|",
          "fontSize",
          "fontColor",
          "|",
          "bulletedList",
          "numberedList",
          "|",
          "outdent",
          "indent",
          "|",
          "alignment:left",
          "alignment:center",
          "alignment:right",
          "alignment:justify",
          "|",
          "link",
          "blockQuote",
        ],
        shouldNotGroupWhenFull: true,
      },

      heading: {
        options: [
          {
            model: "paragraph",
            view: "p",
            title: "Paragraph",
            class: "ck-heading_paragraph",
          },
          {
            model: "heading1",
            view: "h1",
            title: "Heading 1",
            class: "ck-heading_heading1",
          },
          {
            model: "heading2",
            view: "h2",
            title: "Heading 2",
            class: "ck-heading_heading2",
          },
          {
            model: "heading3",
            view: "h3",
            title: "Heading 3",
            class: "ck-heading_heading3",
          },
        ],
      },

      fontSize: {
        options: [10, 12, 14, 16, 18, 24, 32],
        supportAllValues: true,
      },

      alignment: {
        options: ["left", "center", "right", "justify"],
      },

      link: {
        addTargetToExternalLinks: true,
      },
    }),
    []
  );

  function getTextLength(html) {
    const plainText = html
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    return plainText.length;
  }

  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-700 mb-1">
        {label}
        <span className="text-red-500 ml-1">*</span>
      </label>

      <div className="ckeditor-wrapper border border-slate-300 bg-white">
        <CKEditor
          editor={ClassicEditor}
          config={editorConfig}
          data={defaultValue}
          onChange={(_, editor) => {
            setContent(editor.getData());
          }}
        />

        <div className="text-right text-[10px] text-slate-500 px-2 py-1 border-t bg-white">
          Characters: {getTextLength(content)}/{max}
        </div>
      </div>
    </div>
  );
}

export default SimpleWysiwygEditor;