# Scene prompt review cases

These are manual LLM evaluation cases, not assertions that a particular model has
passed. Run them with the built-in injection template, include the stated card and
history in the actual chat request, and evaluate the final `<pic>` description.
Use a third-person perspective macro except in the first-person case.

Every case must produce one single-line `<pic="...">` after the normal reply, with
a self-contained English description of one final moment. Check visible subject
appearance, current clothes/state, pose/expression/gaze, spatial relationships,
environment, framing/viewpoint, and grounded time/light. Unknown identity facts
must not become invented canon; obscured details must not become visible.

| Case | Card and available history | Latest scene | Required result |
|---|---|---|---|
| Story updates background | Anna is an adult woman with brown eyes, long red hair, and a white dress. Earlier narrative: she cuts her hair short and changes into a black coat. | She opens the door. | Short red hair, brown eyes, black coat; at the open door in one coherent pose. No return to long hair or white dress. |
| Omitted changes persist | Earlier narrative: Anna's coat is rain-soaked; she bandages her left hand and keeps a brass key in her right hand. | She turns toward the stairs without putting anything down. | Retain visible wetness, bandage, and key; update her orientation. Do not restore an older pose or silently heal the injury. |
| Narrative corrects old pic | Card and narrative establish brown eyes and a black coat. An old pic incorrectly says blue eyes and a white dress. | A front-facing close-up of Anna at the same door. | Brown eyes and the visible black coat; never propagate the old pic's conflicting attributes. |
| Several characters | Anna: red hair, brown eyes, black coat. Ben: bald adult man, gray eyes, green shirt. Story places Anna beside the door and Ben beside the table. | Anna offers Ben the key; Ben reaches toward it. | Keep each person's attributes separate; locate both, describe the handoff/contact and consistent relative positions. A selected reference for Anna does not apply to Ben. |
| Occlusion and POV | Same Anna, viewed from the user's first-person perspective. Her back faces the user as she walks away down the corridor. | She stops facing the closed door at the corridor's end. | Back view and visible hair/coat/pose in the corridor, no visible facial close-up or eyes through her head, no unexplained view of the user's face/full body. |
| One final moment | Anna starts seated at a window. The reply narrates her rising, crossing the room, and opening the door. | The reply ends with her holding the open door. | One frame at the door; no seated duplicate, montage, simultaneous walking/seated pose, or multiple pic tags. |
| Reference is not a wardrobe command | Selected Anna reference lists a white formal dress and blue travel outfit, plus an explicit identity token `anna_xyz`. Narrative establishes her current black coat and short hair. | Anna waits under the doorway lamp at night. | Black coat and short hair; do not pick/mix listed alternatives. Preserve the explicit identity token alongside visible appearance. Describe the established lamp/night, not a new daylight setting. |
| Truncated history | Only a card and the latest scene survive in the request. No earlier pic or narrative is available. | Anna stands beside a plain wall; no exact age, weather, or light source is established. | Use non-conflicting card information and conservative photographic completion; do not claim remembered events, invent an exact age, add a second participant, or assign an unsupported costume change. |

Record the model, macro values, the actual context sent, generated text, and
failures when evaluating. Word limits can be increased for crowded scenes.
