document.addEventListener("DOMContentLoaded", function () {
  new LuminousGallery(document.querySelectorAll('a.luminous'));

  // NOTE: katex dependency should be upgraded after 1.0 released due to this:
  // https://github.com/KaTeX/KaTeX/issues/1456
  renderMathInElement(
    document.body,
    {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false }
      ]
    });
});
