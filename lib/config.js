import { hostModuleUrl } from './host-resolve.js'

const { default: z } = await import(hostModuleUrl(process.execPath, 'schemastery', 'index.mjs'))

/** Live fields. The settings page writes them, and the next round reads them. */
export const Config = z.object({
  confirmed: z.boolean().default(false).volatile(),
  device: z.string().default('').volatile(),
  screenCount: z.number().default(0).volatile(),
  originX: z.number().default(0).volatile(),
  originY: z.number().default(0).volatile(),
  side: z.string().default('right').volatile(),
  fraction: z.number().min(0.05).max(0.95).default(0.5).volatile(),
  stopped: z.boolean().default(false).volatile(),
  screensJson: z.string().default('[]').volatile(),
})
