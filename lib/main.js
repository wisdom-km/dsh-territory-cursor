import { hostModuleUrl } from './host-resolve.js'
import { Config } from './config.js'
import { startSession } from './session.js'
import { registerTools } from './tools.js'

const { defineTool } = await import(hostModuleUrl(process.execPath, 'dsh-tools', 'index.js'))

export const name = 'territory-cursor'
export const inject = ['tools']
export { Config }

/** Host entry. Tools and the settings page share one session. */
export function apply(ctx, config) {
  const session = startSession(ctx, config)
  registerTools(ctx, session, defineTool)
  const view = '地盘光标'
  ctx.logger?.info?.('%s', view)
  if (typeof ctx.effect === 'function') ctx.effect(() => async () => { await session.stop() })
}
