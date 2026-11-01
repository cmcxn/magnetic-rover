# Project release preferences

The user uses “发布” as shorthand for this project's release workflow:

1. Preserve unrelated local changes (including `.codegraph/` and `submission/`).
2. Run relevant tests and builds; resolve failures before releasing.
3. Increment the WeChat patch version from the latest successful upload in
   `minigame/RELEASES.md`, keeping `minigame/release.json` and upload version aligned.
4. Commit the requested changes, integrate into `main` if necessary, and push
   `main` to origin. This workflow is authorized by the user's “发布” request.
5. Build and upload the WeChat mini-game using the configured project and AppID.
6. Record the successful upload, package sizes, version and next version in
   `minigame/RELEASES.md`, then commit and push the record.
7. If authenticated official review/release controls are available, continue the
   requested formal release. Otherwise state exactly what remains in the WeChat
   backend. Uploading a development version is not formal publication.

Do not describe a version as live unless formal publication is verified. Do not
infer authorization to redeploy a separate remote Skynet server from a client
release alone; report when server changes require a coordinated deployment.
