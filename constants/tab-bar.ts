export const TAB_BAR_CONTENT_HEIGHT = 58;

export function getTabBarReserve(bottomInset: number) {
  return TAB_BAR_CONTENT_HEIGHT + Math.max(bottomInset, 12);
}
