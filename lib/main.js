import { settingsView } from './core/settings-view.js'

export const name = 'territory-cursor'

/** Host entry. Step 1 records that the page is unconfigured and does nothing else. */
export function apply(ctx) {
  const view = settingsView()
  ctx.logger.info('%s：%s', view.title, view.detail)
}
