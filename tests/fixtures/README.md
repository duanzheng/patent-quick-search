# DMG SLA fixture

`dmg-eula-resources.xml` is Tauri's/create-dmg's disk-image license resource template, pinned from Tauri commit `d40c19cfba459428fcf30e3dc4044d34ac3c2647`:
https://github.com/tauri-apps/tauri/blob/d40c19cfba459428fcf30e3dc4044d34ac3c2647/crates/tauri-bundler/src/bundle/macos/dmg/eula-resources-template.xml

The create-dmg MIT attribution is preserved in `create-dmg-LICENSE.txt`; the Tauri MIT attribution is also retained in the project's THIRD_PARTY_NOTICES.txt.

The macOS native test creates a tiny image containing only a synthetic `.app` directory with two legal-text fixtures, embeds this SLA template with the project's MIT license, and tests real hdiutil cancellation, acknowledgement, read-only mounting and detachment. There is no application executable, Tauri production build or uploaded installer artifact.
