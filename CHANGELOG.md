# Changelog

## 1.4.0 — 2026-10-05

- Add SillyTavern settings, custom ComfyUI, and custom A1111 / Forge connection modes. New profiles follow the host's image-generation configuration; existing profiles retain their custom settings.
- Use SillyTavern's native image command in host mode and reuse its saved image URL through the extension's existing insertion flow.
- Place ComfyUI workflow selection before connection and parameters. Support shared workflow loading, new workflows, API-format JSON imports, editing, and saving copies.
- Add typed custom variables, replacement previews, workflow validation, and hints showing which generation parameters the workflow uses.
- Simplify parameter controls with size presets, width/height swapping, random seed selection, and collapsible advanced settings. Preserve independent parameters when switching custom modes.
- Expand Simplified Chinese UI text and regression coverage. All 40 automated tests pass; browser interaction checks use mocked backend responses. Real image generation has not been verified against a running backend.
