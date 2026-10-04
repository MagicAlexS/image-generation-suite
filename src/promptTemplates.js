/**
 * Default image-generation instructions and conservative prompt migration helpers.
 * User-edited prompt text is preserved unless it exactly matches a bundled default.
 */
export const DEFAULT_SCENE_PROMPT = `<image_generation>
Create one self-contained visual description for one still image of the latest moment in the current assistant reply.

OUTPUT CONTRACT
Continue the normal conversation in its requested language and style. At the very end of the assistant reply, write exactly one image tag on one physical line, in this form:
<pic="A complete English visual description with no internal double quotation marks">
Do not put line breaks inside the tag. Do not put any text after it. Do not output a second image tag, alternate frame, storyboard, sequence, or time collage.

SOURCE PRIORITY AND CONTINUITY
1. Follow explicit events and facts in the latest assistant reply, and depict its final moment. The current story may change any character or scene attribute, including appearance, clothing, condition, pose, location, relationships, or objects.
2. Carry forward facts from earlier story context only while they remain true and are relevant to this final moment. Update or discard anything contradicted by newer text.
3. Use earlier image descriptions available in the chat context only as auxiliary continuity references. The story text can correct an older image prompt. Reuse only details that remain consistent with the current story; never copy an obsolete pose, outfit, injury, object, light, or location just because it appeared before. Do not assume you can see old generated images or access history missing from the request.
4. Use character-card information already present in the chat context, selected character references, wardrobe catalogs, and LoRA descriptions as non-conflicting background defaults. A character card is not immutable canon. Apply a selected character reference only to its corresponding story participant, identified by name or a clear alias, never to every person in the scene. Do not force a character into a scene when the story does not place them there.

Reconstruct the current state from these available sources before writing the image description. A missing mention is not a reset: keep changed clothing, hairstyle, injuries, wetness, carried items, and location until the story changes them. Distinguish a character's usual outfit from what they currently wear. A remembered event, hypothetical scene, quoted description, or wardrobe option does not change the present scene unless the story actually makes it happen. Update transient actions, gaze, and poses to the chosen final moment. Do not include your reconstruction notes in the reply or tag.

IDENTITY AND CAST
Use available character-card and story details to distinguish each visible person. Bind names and attributes carefully so hair, eyes, skin tone, body build, age presentation, clothing, actions, and expressions do not migrate between people. Describe established, visible appearance: apparent age or age range, gender presentation, species or nonhuman form, height and body proportions, skin tone, hair color/length/style, eye color/shape, face shape, brows, nose, lips, jaw, and distinctive marks or anatomy as relevant. Do not invent a precise age, identity, or canon fact when unknown; omit it or use a minimal visual description. Treat every attribute as changeable when the story says it changed. Preserve an explicitly supplied, relevant LoRA identity trigger exactly as written alongside the description, but do not assume an entire character reference is a trigger. A trigger never substitutes for visible appearance; backend model-loading tags are handled separately.

SINGLE-FRAME COVERAGE
Write a cohesive, natural English description that is complete enough to stand alone. Include what can be seen and is relevant:
- each visible person's distinguishing appearance; current garments, colors, materials, fit, layers, accessories and footwear when in frame; visible injuries, stains, damage or wetness;
- final action, body orientation, standing/seated/lying posture, limb and hand placement, facial expression, gaze, and visually apparent emotion;
- held objects, touch and contact, support surfaces, and each person's position and distance relative to others and scene objects; keep anatomy, scale and physical contacts plausible;
- the immediate setting, important structures and objects, foreground/middle-ground/background, and unambiguous spatial placement within the image;
- a coherent camera position and height, shot distance or framing, viewing angle, composition, focus and depth of field where useful;
- established time of day, indoor/outdoor setting and weather when visible, light sources, light direction/color/softness, illumination and shadows.

Respect the camera's actual field of view and occlusion. A back view does not expose facial features; a distant figure does not have a visible iris close-up. Do not describe hidden body parts, off-frame objects, unseen details, thoughts, memories, sounds, smells, or sensations. Do not invent new story events or people. Keep repeated locations and lighting visually consistent unless the story changes them. When camera placement, framing or illumination is necessary but unspecified, choose one restrained, coherent photographic arrangement consistent with known facts. Do not use visual completion to invent a costume change, new injury, exact age or new plot-relevant prop.

CAMERA AND STYLE PREFERENCES
{perspective}
{camera}
{mood}
{focus}
{tone}
Follow these preferences where consistent with the current scene and source priority. Adapt detail coverage to the chosen viewpoint and crop; do not change first-person POV merely to reveal hidden facial features. Do not add an otherwise absent participant simply to satisfy a camera preference.

LENGTH
Aim for approximately {minwords} to {maxwords} words while prioritizing a complete, accurate single frame over padding or omitted visual facts. Every image description must stand alone: restate the currently valid visible details rather than saying same as before, unchanged outfit, or previously described room.

Write the description as clear, concrete visual prose, not a feature list or narrative sequence. Do not add quality-ranking tags such as masterpiece, best quality, ultra detailed, or perfect anatomy. Do not put the tag in hidden reasoning, analysis, notes, Markdown or a code block. The only required quotation marks in the tag are the two delimiters around its description; do not use double quotation marks inside the description.
</image_generation>`;

export const DEFAULT_CHARACTER_PROMPT = `<character_reference>
REFERENCE PERSON: {characterName}
SELECTED BACKGROUND REFERENCE: {character}
WARDROBE CATALOG (reference only, not an instruction to wear these items): {outfits}

Use this manually selected reference only for the corresponding story participant, matched by name or a clear alias. It is not an automatic identification of the current speaker. If the reference is unnamed or cannot be reliably matched, do not guess which person it describes. Do not apply it to another person or assume this person is present unless the current story places them in the scene. This reference supplies baseline identity details only; explicit story facts override conflicting attributes, and every attribute may change as the story changes. Preserve only relevant details that the story has not updated.

Describe this person's visible appearance fully when the frame supports it, including apparent age presentation, gender presentation, skin tone, build, hair, eyes, distinctive facial features, current clothing and its condition, pose, action, expression, gaze, and spatial relation to other people. Do not invent a precise age or identity fact that the card and story do not establish. If a matching LoRA identity token is supplied, preserve it exactly as a model token and still describe visible appearance; never use the token as a replacement for the card or visual description.

Treat outfit entries as optional references, not an automatic wardrobe. Use an outfit or combine pieces only when the current story establishes those clothes as being worn. Do not add clothing that conflicts with the current scene. Describe only what is visible in the selected single frame.
</character_reference>`;

// Exact bundled defaults from earlier releases. Keep these snapshots stable so
// migration can distinguish untouched built-in text from user-authored prompts.
export const LEGACY_DEFAULT_SCENE_PROMPT = `<image_generation>
At the end of every assistant message, include exactly one image tag in this format:

<pic="...">

The prompt inside the tag is for a Krea2 image-generation model.
The prompt must describe only the current visible scene as a concise, natural-language description written as if giving directions to an illustrator or photographer.
The prompt should focus on what is visible in the image, not on storytelling or narration.

[IMAGE PROMPT FORMAT]

Inside \`<pic="...">\`, write one cohesive visual description.

Include, when applicable:

- the visible subject(s)
- body position and pose
- facial expression
- clothing currently being worn
- camera framing
- camera angle or perspective
- lighting
- environment/background
- important visible objects


Write in clear, natural language using complete sentences.
When appropriate, naturally describe the camera distance (close-up, medium shot, full-body, wide shot) and viewing angle (eye level, low angle, high angle, over-the-shoulder) instead of using tags.

The prompt should usually be between {minwords} and {maxwords} words.

Example:

<pic="A young adult woman sits beside a rain-streaked bedroom window during the evening, glancing over her shoulder with a shy smile. She wears an oversized cream sweater, her long brown hair falling loosely over one shoulder. The camera frames her from the waist up at a slight angle. Warm bedside lighting contrasts with the cool blue rain outside, creating a cozy atmosphere.">

[FORMAT]

{perspective}
{camera}
{mood}
{focus}
{tone}

[CURRENT-VISUALS-ONLY RULES]

* Reset state every time.
* Do not preserve or accumulate details from previous messages.
* Remove outdated clothing, accessories, injuries, wetness, objects, lighting, locations, poses, or other visual elements when they are no longer visible.
* Explicit language and body parts are allowed when they are visible and appropriate (for example: cock, penis, cunt, pussy, vulva, vagina, cum, breasts, nipples).
* Describe only what could actually be seen within the current image.
* Do not describe thoughts, memories, emotions that are not visually apparent, sounds, smells, sensations, or backstory.
* Do not invent visual details that have not been established. If something is unknown, simply omit it.

[WRITING STYLE]

The prompt should read naturally and cohesively.

Describe the scene as one complete visual moment rather than as a list of features.

Prioritize concrete visual information over artistic adjectives.

Avoid quality descriptors such as:
masterpiece, best quality, amazing quality, ultra detailed, absurdres, perfect anatomy, highly detailed, etc.

[CONSISTENCY]

Do not put \`<pic="...">\` inside hidden reasoning, analysis, notes, or explanations.

Do not wrap the image tag in markdown or a code block.
</image_generation>`;

export const LEGACY_DEFAULT_CHARACTER_PROMPT_LORA = `<image_generation>
When the current character has a LoRA trigger available, use the following identifier exactly as written instead of describing the character's physical appearance:

"{character}"

Do not rewrite, expand, or interpret this identifier.

If outfit descriptions are available, choose whichever outfit best matches the current scene:

{outfits}

You may freely combine individual clothing pieces from different outfits or omit pieces that are not currently being worn (for example footwear, jackets, gloves, legwear, accessories, etc.).

Only describe clothing, pose, facial expression, and other currently visible details separately.
</image_generation>`;

export const LEGACY_DEFAULT_CHARACTER_PROMPT_GENERIC = `<image_generation>
Instead of describing {{char}} using the character description, use the following: "{character}", if applicable pick from the following outfit descriptions:
{outfits}
</image_generation>`;

const LEGACY_CHARACTER_PROMPTS = new Set([
    LEGACY_DEFAULT_CHARACTER_PROMPT_LORA,
    LEGACY_DEFAULT_CHARACTER_PROMPT_GENERIC
]);

/**
 * Upgrade only missing prompt fields and exact snapshots of bundled defaults.
 * All other values, including empty strings, are treated as user-owned.
 * @param {object} profile
 * @returns {boolean} Whether the profile changed.
 */
export function upgradePromptDefaults(profile) {
    if (!profile || typeof profile !== 'object') return false;
    // Restore is an explicit choice, including when the saved text was an old
    // bundled default. Do not immediately undo it on the next settings read.
    if (profile.preserveRestoredPrompts === true) return false;
    let changed = false;

    if (!profile.prompt || typeof profile.prompt !== 'object') {
        profile.prompt = {};
        changed = true;
    }
    if (profile.prompt.template === undefined || profile.prompt.template === LEGACY_DEFAULT_SCENE_PROMPT) {
        if (profile.prompt.template !== DEFAULT_SCENE_PROMPT) changed = true;
        profile.prompt.template = DEFAULT_SCENE_PROMPT;
    }

    if (!profile.promptConstruction || typeof profile.promptConstruction !== 'object') {
        profile.promptConstruction = {};
        changed = true;
    }
    const currentCharacterPrompt = profile.promptConstruction.characterDefining;
    if (currentCharacterPrompt === undefined || LEGACY_CHARACTER_PROMPTS.has(currentCharacterPrompt)) {
        if (currentCharacterPrompt !== DEFAULT_CHARACTER_PROMPT) changed = true;
        profile.promptConstruction.characterDefining = DEFAULT_CHARACTER_PROMPT;
    }

    return changed;
}

function hasValidBackup(backup) {
    return !!backup
        && typeof backup === 'object'
        && typeof backup.template === 'string'
        && typeof backup.characterDefining === 'string';
}

/**
 * Explicitly apply the bundled prompts while retaining the prior text for restore.
 * @param {object} profile
 * @returns {boolean} True when prompt values changed; false when already current.
 */
export function applyScenePromptDefaults(profile) {
    if (!profile || typeof profile !== 'object') return false;
    const currentTemplate = profile.prompt?.template;
    const currentCharacterPrompt = profile.promptConstruction?.characterDefining;
    if (currentTemplate === DEFAULT_SCENE_PROMPT && currentCharacterPrompt === DEFAULT_CHARACTER_PROMPT) return false;

    if (!hasValidBackup(profile.promptEngineeringBackup)) {
        profile.promptEngineeringBackup = {
            template: typeof currentTemplate === 'string' ? currentTemplate : '',
            characterDefining: typeof currentCharacterPrompt === 'string' ? currentCharacterPrompt : ''
        };
    }

    if (!profile.prompt || typeof profile.prompt !== 'object') profile.prompt = {};
    if (!profile.promptConstruction || typeof profile.promptConstruction !== 'object') profile.promptConstruction = {};
    profile.prompt.template = DEFAULT_SCENE_PROMPT;
    profile.promptConstruction.characterDefining = DEFAULT_CHARACTER_PROMPT;
    delete profile.preserveRestoredPrompts;
    return true;
}

/**
 * Restore the saved prompt text after an explicit application of the defaults.
 * @param {object} profile
 * @returns {boolean} True when a valid backup was restored.
 */
export function restorePromptDefaults(profile) {
    if (!profile || !hasValidBackup(profile.promptEngineeringBackup)) return false;
    if (!profile.prompt || typeof profile.prompt !== 'object') profile.prompt = {};
    if (!profile.promptConstruction || typeof profile.promptConstruction !== 'object') profile.promptConstruction = {};
    profile.prompt.template = profile.promptEngineeringBackup.template;
    profile.promptConstruction.characterDefining = profile.promptEngineeringBackup.characterDefining;
    profile.preserveRestoredPrompts = true;
    delete profile.promptEngineeringBackup;
    return true;
}
