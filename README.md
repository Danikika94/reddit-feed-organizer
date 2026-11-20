# Reddit Feed Organizer

A lightweight Tampermonkey userscript that adds three filtering tabs to Reddit:

- **All Posts** — show all detected posts.
- **SFW** — show posts not detected as NSFW. This is the default view.
- **NSFW** — show posts flagged as NSFW.

The script targets Reddit's modern interface and includes basic selectors for Old Reddit.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open [the userscript source](src/reddit-feed-organizer.user.js).
3. Select **Raw** on GitHub and install/copy the script into Tampermonkey.
4. Alternatively, download the `.user.js` file and open it in your browser.
5. Save the script in Tampermonkey and reload Reddit.

## Features

- Three tabs: All Posts, SFW and NSFW.
- SFW is selected by default.
- Counters for detected posts in each category.
- Detects posts added through Reddit's dynamic feed.
- Caches post classifications to avoid repeated NSFW checks.
- No Reddit API credentials, external libraries or network requests.

## Performance

The script observes DOM additions and removals to detect posts loaded by Reddit. It inspects newly added subtrees instead of rescanning the entire page for every DOM mutation. Post classifications are cached in a `WeakMap`.

## Limitations

- Only posts currently present in the page are filtered; the script does not fetch more posts.
- NSFW detection relies primarily on Reddit's post attributes, with flair indicators as a fallback.
- Reddit may change its DOM structure. If post detection stops working after a Reddit interface update, selectors may need maintenance.
- This script does not change Reddit account settings or server-side NSFW preferences.
- This is a client-side visibility filter, not a content moderation or access-control mechanism.

## Configuration

At the top of the userscript:

```javascript
const CONFIG = {
    defaultTab: 'sfw',
    showCounts: true,
    sticky: true
};
```

- `defaultTab`: `all`, `sfw` or `nsfw`.
- `showCounts`: display the number of detected posts in each tab.
- `sticky`: keep the tab bar sticky while scrolling.

## Supported URL patterns

- `https://www.reddit.com/*`
- `https://old.reddit.com/*`
- `https://new.reddit.com/*`

## License

MIT. See [LICENSE](LICENSE).
