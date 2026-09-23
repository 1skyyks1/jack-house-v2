# AI image tool module

This directory owns the Jack House integration with the 65535 native asynchronous image task API.

Module responsibilities:

- authenticated tool routes and submission rate limiting;
- temporary reference-image and mask uploads, including cleanup;
- per-role daily quotas, per-account locking, and the global concurrency guard;
- event-driven asynchronous status synchronization (fast while active, stopped while idle);
- authenticated result proxying as a download fallback when direct browser downloads are unavailable;
- image-job and audit persistence models.

New submissions use `/v1/tasks` and forward the Jack House idempotency key to the
upstream API. Queries fall back to the legacy compatibility host only when a task
is not found by the native API, allowing unfinished pre-migration jobs to finish.
Users can select `gpt-image-2.5-flare` or `gpt-image-2.5-sunburst` for generation
and editing. `/tool/aimg/config` exposes `allowedModels` and `defaultModel`, and
submissions accept a `model` field. `AI_IMAGE_MODEL` configures the default;
missing or unsupported values fall back to `gpt-image-2.5-flare`. Submissions
without a model use that default, while unsupported model selections are rejected.

Generated images and upstream result URLs are deliberately not persisted. The rest
of the backend only mounts `router` and calls `start()` from `index.js`.
