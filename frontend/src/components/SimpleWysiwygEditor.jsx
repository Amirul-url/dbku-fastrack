import { useEffect, useMemo, useState } from "react";
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
  Table,
  TableToolbar,
  Underline,
  Undo,
} from "ckeditor5";

import "ckeditor5/ckeditor5.css";

function SimpleWysiwygEditor({ label, value = "", onChange, max = 3000, readOnly = false }) {
  const [content, setContent] = useState(value || "");

  useEffect(() => {
    setContent(value || "");
  }, [value]);

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
        Table,
        TableToolbar,
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
          "insertTable",
          "blockQuote",
        ],
        shouldNotGroupWhenFull: true,
      },

      table: {
        contentToolbar: ["tableColumn", "tableRow", "mergeTableCells"],
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
        options: [10, 11, 12, 13, 14, 16, 18, 24, 32],
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
    const plainText = String(html || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    return plainText.length;
  }

  function normalizeDefaultFontSize(html) {
    if (!html || !html.trim()) {
      return '<p><span style="font-size:12px;">&nbsp;</span></p>';
    }

    return html;
  }

  return (
    <div>
      <style>
        {`
          .ckeditor-wrapper .ck-editor__editable_inline {
            min-height: 160px;
            font-size: 12px !important;
            line-height: 1.5 !important;
          }

          .ckeditor-wrapper .ck-content {
            font-size: 12px !important;
          }

          .ckeditor-wrapper .ck-content p {
            font-size: 12px;
            line-height: 1.5;
          }
        `}
      </style>

      <label className="block text-[11px] font-bold text-slate-700 mb-1">
        {label}
        <span className="text-red-500 ml-1">*</span>
      </label>

      <div className="ckeditor-wrapper border border-slate-300 bg-white">
        <CKEditor
          editor={ClassicEditor}
          config={editorConfig}
          data={normalizeDefaultFontSize(content)}
          disabled={readOnly}
          onChange={(_, editor) => {
            if (readOnly) return;

            const data = editor.getData();

            setContent(data);

            if (typeof onChange === "function") {
              onChange(data);
            }
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
