# AI image tool module

This directory owns the Jack House integration with the 65535 `gpt-image-2` API.

Module responsibilities:

- authenticated tool routes and submission rate limiting;
- temporary reference-image and mask uploads, including cleanup;
- per-role daily quotas, per-account locking, and the global concurrency guard;
- event-driven asynchronous status synchronization (fast while active, stopped while idle);
- authenticated result proxying as a download fallback when direct browser downloads are unavailable;
- image-job and audit persistence models.

Generated images and upstream result URLs are deliberately not persisted. The rest
of the backend only mounts `router` and calls `start()` from `index.js`.
