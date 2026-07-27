// Tracks whether the current tab reached a hill page by navigating from the
// hills index. If so, the "All hills" button can use history.back() and get the
// browser's scroll restoration for free; otherwise it falls back to pushing "/".

const KEY = 'hill-nav-from-index';

export function markNavigatedFromIndex() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // sessionStorage unavailable (private mode, etc.) — back button just falls back.
  }
}

export function consumeNavigatedFromIndex(): boolean {
  try {
    const found = sessionStorage.getItem(KEY) === '1';
    sessionStorage.removeItem(KEY);
    return found;
  } catch {
    return false;
  }
}
