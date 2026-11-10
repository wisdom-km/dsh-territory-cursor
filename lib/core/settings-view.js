/** Settings copy for the current step. Pure data: no host, no window, no cursor. */
export function settingsView() {
  return {
    state: 'unconfigured',
    title: '地盘光标',
    detail: '地盘还没确认。这一步只打开设置页。',
  }
}
