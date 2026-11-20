# Changelog

All notable project changes are documented here.

## [1.1.1] - 2026-11-20

### Changed
- Set SFW as the default tab on page load.
- Retained All Posts and NSFW tabs as manual alternatives.
- Documented the default view and configuration.

### Notes
- Based on the lightweight incremental-processing implementation.
- No external dependencies or API credentials required.

## [1.1.0]

### Improved
- Replaced repeated full-page post scans with incremental processing.
- Cached post classification using a WeakMap.
- Updated counters incrementally.
- Removed the one-second navigation polling loop.
- Added a lighter DOM observer for dynamically added and removed posts.

## [1.0.0]

### Added
- All Posts, SFW and NSFW tabs.
- Per-tab post counters.
- Initial Reddit feed filtering.
- Support for Reddit dynamic feed updates.
