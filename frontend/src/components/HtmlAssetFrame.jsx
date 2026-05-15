import { useCallback } from "react";

function HtmlAssetFrame({ src, title, className = "", fit = "contain" }) {
  const applyFrameStyles = useCallback((event) => {
    try {
      const doc = event.currentTarget.contentDocument;
      const image = doc?.querySelector("img");

      if (!doc || !image) return;

      doc.documentElement.style.margin = "0";
      doc.documentElement.style.width = "100%";
      doc.documentElement.style.height = "100%";
      doc.body.style.margin = "0";
      doc.body.style.width = "100%";
      doc.body.style.height = "100%";
      doc.body.style.overflow = "hidden";
      image.style.display = "block";
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.objectFit = fit;
    } catch {
      // Public HTML assets are same-origin in production; if a browser blocks access,
      // the iframe still renders with the original generated HTML.
    }
  }, [fit]);

  return (
    <iframe
      src={src}
      title={title}
      className={`border-0 ${className}`}
      scrolling="no"
      tabIndex={-1}
      onLoad={applyFrameStyles}
    />
  );
}

export default HtmlAssetFrame;
