/* Google AdSense configuration — DISABLED by default.
 *
 * Ad containers on every page stay hidden and no AdSense script is loaded until you:
 *   1. Get approved by Google AdSense.
 *   2. Set enabled to true and enter your publisher id (ca-pub-XXXXXXXXXXXXXXXX).
 *   3. Create ad units in AdSense and paste each unit's slot id below.
 *
 * Slot names match the data-ad-slot attribute on the containers:
 *   home      – homepage in-content ad
 *   tool      – ad between tool and instructions on tool pages
 *   sidebar   – desktop-only sidebar on tool pages
 *   incontent – responsive ad inside long text pages (optional)
 *
 * Do not place ads close to buttons (avoid accidental clicks) and never click your own ads.
 */
window.TOOLNEST_ADS = {
  enabled: false,
  client: 'ca-pub-0000000000000000',
  slots: {
    home: '',
    tool: '',
    sidebar: '',
    incontent: ''
  }
};
