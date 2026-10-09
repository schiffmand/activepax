# Binaural layer app (working title)

Incubating inside `activepax`; will migrate to its own repo.

A phone app that plays binaural beats *underneath* whatever you already listen to (music, podcasts).

- `docs/`      research, personas, brand, council reviews
- `core/`      audio engine + product logic (UI-independent, tested)
- `native/`    iOS / Android reference engines (mix-with-others audio)
- `prototype/` interactive app demo (React)
- `tools/`     dev tooling (Playwright screenshot helper: `node tools/shoot.mjs <url> <outPrefix> [selectors...]`)
