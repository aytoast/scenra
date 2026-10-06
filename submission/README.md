# Scenra presentation

Chinese / English HTML project proposal for Scenra. Reading order: abstract, scene-to-performance workflow, technical roles, directing within virtual set, reuse, further work and references. Application source stays at repository root.

Three.js figures reuse saved two-actor ARDY motion. First-punch preview applies hand-target keyframes and shorter strike timing to saved positions, preserving other joints, bone lengths and strike endpoint. Direction for Codex appears above apply, scrub, pause and reset controls. Preview uses local IK and interpolation; new ARDY inference requires running model service. Prepared pose and timing targets are in assets/first-punch-edit.json. Full saved take remains expandable.

PICO figure renders shared scene through capture and observer cameras, with simulated headset trajectory and FOV controls. Typography and dark layout support proposal reading. Hardware concepts sit in expandable further-work note.

Scene and prop reference images accompany prototype description. Generated video-village concept photograph accompanies hardware note. Default language is Chinese; use ?lang=en for English.

Serve this folder on port 5188 for local review. Public app URL lives in site-config.json. Local demo button uses port 5175.

Build illustrations with node submission/build-visuals.mjs from repository root. Offscreen and background scenes pause. Reduced-motion preference renders static scene.

Pages workflow publishes submission files and built studio from main, with checks against stale deployments.

Image prompts and provenance: assets/image-provenance.json. Saved ARDY motion license: assets/ARDY-LICENSE.txt.
