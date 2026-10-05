# Image Generation Suite

A fully standalone SillyTavern extension that adds automated image generation to your chats. The extension monitors conversations, injects prompts to make the LLM produce image descriptions, detects those descriptions, and sends them to ComfyUI or A1111/Forge for generation — all automatically.

Everything is organized through a **profile system** so you can save, swap, and share complete configurations for different characters, art styles, or workflows.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Inline Controls](#inline-controls)
- [Settings Tabs](#settings-tabs)
  - [Prompt Injection](#prompt-injection)
  - [Detection Settings](#detection-settings)
  - [Connection](#connection)
  - [Prompt Construction](#prompt-construction)
  - [Styles](#styles)
  - [Characters](#characters)
  - [LoRAs](#loras)
- [Profile System](#profile-system)
- [Custom Macros](#custom-macros)
- [Macro Reference](#macro-reference)
- [ComfyUI Workflow Placeholders](#comfyui-workflow-placeholders)
- [FAQ / Troubleshooting](#faq--troubleshooting)
- [License](#license)

---

## Features

| Feature | Description |
|---------|-------------|
| **Profile System** | Save/load/duplicate/import/export complete configurations as JSON. Switch between setups instantly. |
| **Prompt Injection** | Configurable LLM prompt template with frequency control — tells the LLM to include image descriptions. |
| **Custom Macros** | Define your own `{macroId}` placeholders (list, bool, int, float) and adjust them live from the inline controls. |
| **Regex Detection** | Customizable regex to detect image prompts in assistant messages and extract them for generation. |
| **Connection Management** | Direct ComfyUI and A1111/Forge connection with full workflow management (create, edit, rename, delete). |
| **Prompt Construction** | Template-based prompt building with prefix/suffix, style content, and LoRA tags — fully customizable. |
| **Styles** | Named style profiles with preview images. Switch art styles from the inline controls without editing prompts. |
| **Characters** | Define character appearances and outfits. Selected character descriptions are injected into the generation prompt. |
| **LoRA Lorebook** | Trigger-based LoRA entries that activate when keywords appear in recent messages. Optional AI agent classification. |
| **Image Insertion** | Multiple insert modes (in-message, new message) with LLM hiding to keep image data out of context. |
| **Inline Controls** | Character/style selection, prompt additions, macros, and re-triggering in the extension drawer, alongside all settings. |

---

## Installation

### Method 1: SillyTavern Extension Installer (Recommended)

1. Open SillyTavern and click the **Extensions** button (puzzle piece icon) in the top bar.
2. Click **Install Extension**.
3. Paste the GitHub repository URL:
   ```
   https://github.com/MagicAlexS/image-generation-suite
   ```
4. Click **Save** and reload the page when prompted.
5. Find **Image Generation Suite** in the extensions list → expand it.
6. Check **Enable Extension** and configure the settings directly in the expanded drawer.

### Method 2: Manual Installation

1. Clone or download this repository into your SillyTavern extensions directory:
   ```
   SillyTavern/data/default-user/extensions/third_party/image-generation-suite
   ```
2. Restart SillyTavern.
3. Open **Extensions** in the top bar → find **Image Generation Suite** → expand it.
4. Check **Enable Extension** and configure the settings directly in the expanded drawer.

### Requirements

- SillyTavern (latest recommended)
- A local **ComfyUI** or **A1111 / Forge** instance running with API access enabled
- For A1111: launch with `--api` flag
- For ComfyUI: default setup works out of the box

---

## Quick Start

1. **Enable the extension** in the drawer panel.
2. Choose the **Connection** tag in the inline settings panel.
3. Select your server type (ComfyUI or A1111), enter the URL, and click the connect button.
4. Select your model, sampler, and desired resolution.
5. Go to the **Prompt Injection** tab → enable prompt injection. The default template works out of the box.
6. Start chatting — the extension will inject an image generation prompt every N messages (default: 1) and automatically generate images from the LLM's response.

---

## Inline Controls

All controls and settings live inside **Extensions → Image Generation Suite**. There is no separate floating Hub or settings modal. The panel follows SillyTavern's drawer scrolling and adapts to narrow screens.

- Choose **Quick Controls** for character/style selection, prompt additions, style previews, custom macro values, and re-triggering.
- Choose a category from the visible tags; they wrap on narrow screens. Each category has a heading and description, with related settings grouped into titled cards.
- Use Left/Right arrow keys or Home/End while a tag is focused to switch categories.
- The extension menu shortcut and the existing `/suitehub` command open and scroll to this inline panel.
- Existing profiles and imports remain compatible. Saved floating-window coordinates and visibility are retained as legacy data and no longer affect the interface.

**Retrigger Image Gen** button:
sometimes the agent forgets a quote or changes it to "pic prompt" instead of "pic", that is just something that happens. instead of having to constantly swipe messages I added this button, if you edit the agent message so the prompt is correct you can hit this button and IGS will take over and still generate your image.

### Quick Controls

| Control | Description |
|---------|-------------|
| **Character** | Quick-select which character's appearance prompt is used. |
| **Prompt Addition** | Extra positive prompt text appended to every generation. |
| **Negative Addition** | Extra negative prompt text appended to every generation. |
| **Style** | Quick-select art style from your active style profile (with preview thumbnails). |

### Macro Values

Displays all custom macros you've defined in the Prompt Injection settings. Adjust values in real-time:
- **List macros** → dropdown selector (shows label, uses substitution text)
- **Bool macros** → on/off toggle
- **Int/Float macros** → number input with min/max/step constraints

---

## Settings Tabs

Use the category tags to move directly between quick controls and settings. The selected tag is highlighted, and titled cards distinguish each group of settings from its individual fields. Each section is described below.

---

### Prompt Injection

Controls how and when the extension asks the LLM to produce image descriptions.

| Setting | Description |
|---------|-------------|
| **Enable Prompt Injection** | Master toggle. When on, the prompt template is injected into the conversation. |
| **Injection Frequency** | Generate an image every N messages (e.g., 3 = every 3rd message). |
| **Prompt Template** | The full injection prompt sent to the LLM. Use `{macroId}` to insert custom macro values. |
| **Image Description Format** | Choose **Natural Language** or **Tags**, then click **Apply Preset** to replace the two prompt fields. The current prompts are identified as a preset or **Custom**. |
| **Position & Depth** | Where in the conversation history the injection is placed (System/User/Assistant, with depth control). |
| **Character Defining Prompt** | Appended when a character is selected. Use `{characterName}`, `{character}`, and `{outfits}` placeholders. |

#### Scene continuity defaults

Both built-in presets ask the same chatting LLM to write one self-contained **English** image description at the end of its reply, inside a single-line `<pic="...">` tag. **Natural Language** uses complete sentences; **Tags** uses comma-separated keywords and short phrases. Both use character information already available in SillyTavern's prepared chat context, available story history, earlier image descriptions, and the latest reply. They do not make a separate scene-extraction request or maintain an independent state database.

Both formats retain established character/person names, known work or franchise names, and explicitly supplied identity tokens. Natural language places the name in the sentence with the character's action; tags include identity alongside that subject's attributes. Names provide identity cues while the description still conveys the visible scene. Unknown identities or works must not be guessed, and a work's title does not set the current location, costume, or art style. Explicit story changes override presumed canonical appearances.

For example, the two formats can represent the same moment:

```text
<pic="Hermione Granger from Harry Potter sits beside a rainy window, wearing a dark green sweater. Her hair is cut to shoulder length, and she holds an open book in both hands. An eye-level medium shot shows soft window light.">
<pic="Hermione Granger (Harry Potter), shoulder-length hair, dark green sweater, seated beside rainy window, holding open book in both hands, eye-level medium shot, soft window light">
```

These are illustrative output formats; the model must take identities and scene details from the available context. Both continue to use the existing image-tag detection and backend prompt construction.

The rules distinguish background references from the current story state:

1. Explicit events and changes in the current scene take priority.
2. Earlier story facts remain valid until changed: clothing, haircuts, injuries, wetness, held objects, and the environment do not reset just because the latest sentence omits them.
3. Earlier `<pic>` descriptions are supporting references only when consistent with the story. Narrative text corrects mistakes in older image descriptions.
4. Character cards, the manually selected character reference, outfit options, and LoRA descriptions provide non-conflicting background defaults. They do not undo story changes or establish who is present or what outfit is currently worn.

Each description depicts one moment at the end of the latest reply, with enough visible detail to stand alone: character appearance and current clothing/state, expression and gaze, pose and physical contacts, positions and spatial relationships, foreground/background, camera framing and viewpoint, time/weather, light sources and shadows. Attributes belong to individual subjects; an identity trigger does not replace appearance. Details must fit the camera's visible range, including occlusion and first-person views. Missing camera or lighting details may be completed conservatively without adding story events or new character facts.

Old unmodified built-in templates upgrade automatically, including imported profiles. Custom templates (including intentionally empty ones) and existing macro values are preserved. In **Prompt Injection**, choosing a format does not change your prompt text until you click **Apply Preset**. Applying a preset replaces both prompt fields in the current profile and saves the previous two fields; **Restore Previous Prompts** restores that saved copy, even after reloading. If a saved copy already exists, applying another preset keeps the original copy until it is restored. Applied templates persist with the profile and support profile switching, duplication, and import/export. You can edit either field after applying; the current prompts then display as **Custom**. These actions leave macros, frequency, injection position, connection, and generation settings unchanged.

New profiles start with the natural-language preset and a 120–500 word target; existing profiles keep their configured word-count macros. Adjust the limits in Quick Controls for crowded scenes. The tag preset uses the same scene coverage without a word-count target and does not use the minimum/maximum word-count macros. In the exact built-in natural-language template, missing word-count macros fall back to 120 and 500. In either exact built-in template, missing optional camera/style macros contribute no preference. This does not add or modify stored macros. Custom templates keep their own placeholder behavior.

Only history that SillyTavern actually includes in the model request can inform continuity. The plugin keeps the original `<pic>` text in the default new-message mode, but chat truncation or host-side filtering can remove it. Stored image metadata and hidden image-only messages are not a substitute for available narrative history. More concrete descriptions reduce ambiguity; prompt rules alone do not guarantee identical images or LLM compliance.

Below the injection settings is the **Custom Macros** editor — see [Custom Macros](#custom-macros) for details.

---

### Detection Settings

Controls how image prompts are extracted from LLM output.

| Setting | Description |
|---------|-------------|
| **Insert Type** | How the generated image is inserted: `New Message` (separate message) or `In Message` (embedded in the assistant's message). |
| **Regex Pattern** | The regex used to detect image tags. Default: `/\<pic="(.*?)"\s*\/?\s*\>/g` — captures content inside `<pic="...">` tags. |
| **Hide from LLM** | When enabled, generated image messages are excluded from the LLM's context window. |

---

### Connection

Configure your image generation backend.

| Setting | Description |
|---------|-------------|
| **Server Type** | `ComfyUI` or `A1111 / Forge`. |
| **URL** | ComfyUI default: `http://127.0.0.1:8188` · A1111 default: `http://localhost:7860` |
| **Auth** | A1111 only — optional `user:password` for API authentication. |
| **Model / VAE / Sampler / Scheduler** | Populated from the server after connecting. |
| **Steps / CFG Scale / Width / Height** | Standard generation parameters. |
| **Denoising Strength** | For img2img workflows. |
| **Clip Skip** | CLIP skip layers (1–12). |
| **Seed** | Use -1 for random. |

#### ComfyUI Workflow Management (W.I.P.)

When using ComfyUI, you get full workflow CRUD (I highly recommend using the built in ST sd extension workflow editor to make edits):
- **Edit** — Open an inline JSON editor for the selected workflow in the Connection section.
- **New** — Create a new empty workflow and open the editor.
- **Rename** — Rename the selected workflow file.
- **Delete** — Remove the selected workflow.

See [ComfyUI Workflow Placeholders](#comfyui-workflow-placeholders) for the template variables you can use in workflows.

---

### Prompt Construction

Controls how the final Stable Diffusion prompt is assembled from all the pieces.

| Setting | Description |
|---------|-------------|
| **Prompt Prefix** | Always prepended (e.g., `best quality, absurdres, aesthetic`). |
| **Negative Prefix** | Always prepended to negative (e.g., `lowres, bad anatomy, ...`). |
| **Prompt Suffix** | Always appended after everything else. |
| **Negative Suffix** | Always appended to negative. |
| **Positive Template** | Defines the assembly order. Default: `{prefix}, {prompt}, {promptExtra}, {style}, {loras}, {suffix}` |
| **Negative Template** | Default: `{negativePrefix}, {negative}, {negativeExtra}, {negativeSuffix}` |

---

### Styles

Named art style definitions organized into **style profiles**. Each profile can contain multiple styles.

| Feature | Description |
|---------|-------------|
| **Style Profiles** | Group styles together (e.g., "Anime Styles", "Realistic Styles"). Switch between groups per main profile. |
| **Style Name** | Display name shown in the inline style selector. |
| **Style Content** | The actual prompt text inserted as `{style}` in the positive template. |
| **Preview Image** | Optional base64 preview shown in the inline style selector. |
| **Import/Export** | Share style profiles as JSON files. |

---

### Characters (W.I.P)

Define character appearances for consistent image generation. Organized into **character profiles**.

| Feature | Description |
|---------|-------------|
| **Character Profiles** | Group characters (e.g., "Fantasy RP Characters", "Sci-Fi Characters"). Different main profiles can reference different character sets. |
| **Character Name** | Display name shown in the inline character selector. |
| **Character Prompt** | The appearance description injected via the `{character}` placeholder. |
| **Outfits** | Named outfit reference descriptions, listed via `{outfits}`. Scene defaults use them only when supported by the story; they do not automatically choose or mix clothing. |

---

### LoRAs (W.I.P)

Trigger-based LoRA entries that activate when keywords appear in recent chat messages.

| Feature | Description |
|---------|-------------|
| **LoRA Profiles** | Group LoRA sets by use case (e.g., "Anime LoRAs", "Realism LoRAs"). |
| **Description** | What this LoRA represents — used for AI agent classification. |
| **Prompt / Content** | The LoRA tag and associated prompt keywords (e.g., `<lora:cyber_arm:1.0>, cybernetic details`). |
| **Trigger Words** | Keywords that activate this entry when found in recent messages. |
| **Case Sensitive** | Whether trigger matching is case-sensitive. |
| **Enabled** | Toggle individual entries on/off. |

---

## Profile System

The extension uses a **nested profile architecture**:

```
Main Profile (e.g., "My Fantasy Setup")
├── Connection settings (server, model, resolution, etc.)
├── Prompt injection settings (template, frequency, position)
├── Prompt construction settings (templates, prefix/suffix)
├── Detection settings (regex, insert type)
├── Custom macros
├── Hub extras (prompt addition, negative addition)
├── Active Style Profile → points to a Style Profile
├── Active Character Profile → points to a Character Profile
└── Active LoRA Profile → points to a LoRA Profile

Style Profiles (global, shared across main profiles)
├── "Anime Styles" → [Style 1, Style 2, ...]
└── "Realistic Styles" → [Style 1, Style 2, ...]

Character Profiles (global, shared)
├── "Fantasy Characters" → [Character 1, Character 2, ...]
└── "Sci-Fi Characters" → [Character 1, Character 2, ...]

LoRA Profiles (global, shared)
├── "Anime LoRAs" → [Entry 1, Entry 2, ...]
└── "Realism LoRAs" → [Entry 1, Entry 2, ...]
```

**Key concept**: Style, Character, and LoRA profiles are **global collections**. Each main profile simply holds a *reference* to which one it uses. This means:
- You can share the same style profile across multiple main profiles.
- Switching main profiles can switch all three sub-profiles at once.
- You can export/import sub-profiles independently.

### Profile Actions

Available on the main profile bar and each sub-profile bar:

| Action | Icon | Description |
|--------|------|-------------|
| **Add** | ➕ | Create a new profile |
| **Duplicate** | 📋 | Clone the current profile |
| **Rename** | ✏️ | Rename the current profile |
| **Delete** | 🗑️ | Delete (cannot delete last profile) |
| **Export** | 📤 | Download as JSON file |
| **Import** | 📥 | Upload a JSON file |

---

## Custom Macros

Custom macros let you define dynamic `{macroId}` placeholders in your prompt injection template that can be adjusted in real-time from the inline macro controls.

### Macro Types

| Type | Inline Control | Use Case |
|------|------------|----------|
| **List** | Dropdown selector | Predefined options. Each option has a **label** (shown in dropdown) and **text** (substituted). E.g., perspectives, moods, camera angles. |
| **Bool** | On/Off toggle | When ON, inserts the defined text. When OFF, inserts nothing. E.g., "include background description". |
| **Int** | Number input | Integer value with min/max/step constraints. E.g., "number of characters in scene". |
| **Float** | Number input | Decimal value with min/max/step constraints. E.g., "detail level 0.0–1.0". |

### Example

Define a macro with ID `perspective`:
- **Type**: List
- **Options**: 
  - Label: `First person` → Text: `generate as if the image is from the first-person perspective of {{user}}`
  - Label: `Third person` → Text: `generate as if the image is from a third-person perspective`
  - Label: `Birds eye` → Text: `generate as if the image is from a bird's-eye view looking down`

Then use it in your prompt template:
```
When generating an image prompt, {perspective}. Format it as <pic="your prompt here">.
```

The selected option's text will be substituted for `{perspective}` at injection time.

### Reserved IDs

The following macro IDs are reserved and cannot be used for custom macros:
`prefix`, `prompt`, `style`, `styles`, `suffix`, `loras`, `promptExtra`, `negativeExtra`, `negativePrefix`, `negative`, `negativeSuffix`, `character`, `characterName`, `outfits`

---

## Macro Reference

### Prompt Construction Macros

Used in the **Positive Template** and **Negative Template** fields:

| Macro | Description | Used In |
|-------|-------------|---------|
| `{prefix}` | Prompt Prefix content | Positive |
| `{prompt}` | The raw prompt extracted from the LLM's image tag | Positive |
| `{promptExtra}` | Inline "Prompt Addition" field | Positive |
| `{style}` / `{styles}` | Active style's content text | Positive |
| `{loras}` | Compiled LoRA prompt tags from matched triggers | Positive |
| `{suffix}` | Prompt Suffix content | Positive |
| `{negativePrefix}` | Negative Prefix content | Negative |
| `{negative}` | Any extracted negative prompt | Negative |
| `{negativeExtra}` | Inline "Negative Addition" field | Negative |
| `{negativeSuffix}` | Negative Suffix content | Negative |

### Character Defining Macros

Used in the **Character Defining Prompt** field:

| Macro | Description |
|-------|-------------|
| `{characterName}` | The manually selected character's name, used to bind the reference to the matching story participant |
| `{character}` | The selected character's prompt/appearance description |
| `{outfits}` | Comma-separated list of all outfit descriptions for the selected character |

### Custom User Macros

Used in the **Prompt Template** (injection prompt) field:

| Syntax | Description |
|--------|-------------|
| `{macroId}` | Replaced with the macro's current resolved value (selected list option text, bool text if ON / empty if OFF, or the number value) |

---

## ComfyUI Workflow Placeholders

When using ComfyUI, you can use these placeholders in your workflow JSON. They are replaced with the actual values at generation time:

| Placeholder | Replaced With |
|-------------|--------------|
| `"%prompt%"` | Final positive prompt (JSON-escaped) |
| `"%negative_prompt%"` | Final negative prompt (JSON-escaped) |
| `"%model%"` | Selected model name |
| `"%vae%"` | Selected VAE name |
| `"%sampler%"` | Selected sampler name |
| `"%scheduler%"` | Selected scheduler name |
| `"%steps%"` | Steps count |
| `"%scale%"` | CFG Scale value |
| `"%width%"` | Image width |
| `"%height%"` | Image height |
| `"%denoise%"` | Denoising strength |
| `"%clip_skip%"` | Clip skip value |
| `"%seed%"` | Seed value (-1 = random) |

> **Note**: Placeholders must include the surrounding quotes in the workflow JSON, e.g., `"%prompt%"` not `%prompt%`, because the replacement includes JSON escaping.

---

## FAQ / Troubleshooting

**Q: Images aren't generating.**
- Make sure the extension is enabled (checkbox in the drawer).
- Make sure prompt injection is enabled in the Prompt Injection tab.
- Check the Connection tab — click the connect button and verify you see a green status dot.
- Check the browser console (F12) for `[IGS]` prefixed error messages.

**Q: The LLM isn't producing image tags.**
- Check your prompt template in the Prompt Injection tab. Make sure it instructs the LLM to use the correct tag format (default: `<pic="...">`).
- Make sure the injection frequency isn't set too high.
- Check the position/depth settings — try `System (deep)` at depth 0.

**Q: My LoRAs aren't being applied.**
- Make sure the LoRA entries are enabled (checkbox in the editor).
- Check that trigger words match text in recent messages (case-sensitivity setting matters).
- Verify the LoRA prompt field contains the actual `<lora:name:weight>` tag.

**Q: I switched profiles but my characters/styles are gone.**
- Each main profile references specific sub-profiles. Check which style/character/LoRA profile is selected in the respective tabs.

**Q: How do I use this with ComfyUI?**
- Set server type to ComfyUI, enter your ComfyUI URL, and connect.
- Select or create a workflow in the Connection tab.
- Use the workflow placeholders (see table above) in your workflow JSON nodes.

**Q: Where are the Suite Hub and settings popup?**
- This fork combines them into the Image Generation Suite extension drawer.
- Open **Extensions → Image Generation Suite**, use the extension menu shortcut, or type `/suitehub` to jump to the inline panel.

---

## License

MIT License — see [LICENSE](LICENSE) for details.
