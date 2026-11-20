# Changelog

All notable project changes are documented here.

## [1.1.5] - 2026-11-20

### Fixed
- Prevented NSFW posts from briefly reappearing while opening an individual post or navigating between Reddit feed routes.
- The script now suspends feed processing and removes the toolbar without immediately clearing the active SFW hiding classes.
- The previous filter state is cleared only after the destination feed is present; the new feed is filtered in the same JavaScript task before the browser can paint an unfiltered frame.
- Restricted incremental post processing to mutations inside the active feed, avoiding unrelated post-detail and recommendation content.

### Notes
- Individual post pages remain excluded: no organizer toolbar or post-detail filtering is activated there.
- SFW remains the default tab whenever a feed is initialized.
- No external dependencies or Reddit API credentials required.

## [1.1.4] - 2026-11-20

### Fixed
- Fixed reinitialization when returning to Reddit's home feed using the top-left Reddit logo.
- Added internal-link click and Navigation API handling as fallbacks to History API hooks, including from individual post pages where the feed observer is stopped.
- Reset feed state, counters, toolbar and hidden-post classes on every route change, including subreddit-to-home and subreddit-to-subreddit navigation.
- Wait for an actual Reddit feed container before injecting the toolbar, avoiding injection into stale post-detail layouts during transitions.
- Observe the document element so the active observer remains connected when Reddit replaces body content.

### Notes
- SFW remains the default tab after entering a feed.
- Individual post pages remain excluded.
- No external dependencies or Reddit API credentials required.

## [1.1.3] - 2026-11-20

### Fixed
- Disabled the organizer entirely on individual Reddit post pages (permalinks containing `/comments/`).
- Restricted toolbar injection to supported feed-listing routes; no fallback injection into arbitrary page bodies.
- Added handling for Reddit single-page navigation (`pushState`, `replaceState`, back/forward and hash changes).
- Cleaned up the toolbar, styles and hidden-post classes when navigating away from a feed.

### Notes
- Feed filtering remains SFW by default.
- No API credentials or external dependencies required.

## [1.1.2] - 2026-11-20

### Fixed
- Vertically centered the text and post counters inside all organizer buttons.
- Switched the tab buttons to inline-flex alignment so labels remain centered consistently.

### Notes
- No changes to feed filtering, post classification, or tab behavior.

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
