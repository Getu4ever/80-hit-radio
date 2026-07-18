/**
 * Open a URL in a new tab. Falls back to same-tab navigation only if the
 * popup is blocked.
 *
 * Important: do not pass "noopener" / "noreferrer" in windowFeatures — browsers
 * return null even when the tab opens successfully, which would incorrectly
 * trigger same-tab navigation as well.
 */
export function openExternalUrl(url: string): void {
  const opened = window.open(url, "_blank");
  if (opened) {
    opened.opener = null;
  } else {
    window.location.assign(url);
  }
}
