/**
 * Register the two agent tools. `defineTool` is passed in so tests do not load the host package.
 * @param {object} ctx
 * @param {{ snapshot: Function, act: Function }} session
 * @param {Function} defineTool
 */
export function registerTools(ctx, session, defineTool) {
  ctx.tools.register(defineTool({
    name: 'territory_snapshot',
    description: '读取地盘里的窗口和控件，并截下地盘矩形。不移动系统鼠标。地盘还没确认时会拒绝。返回的 ref 只对这一张图有效。',
    timeoutMs: 20000,
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          image: { type: 'object' },
        },
      },
      render: (_args, value) => {
        const blocks = [{ type: 'text', text: value.text }]
        if (value.image) blocks.push({ type: 'image', attachment: value.image })
        return blocks
      },
    },
    async execute(_args, exec) {
      if (exec?.signal?.aborted) throw new Error('cancelled')
      const shot = await session.snapshot()
      const image = await attach(ctx, shot.png, shot.width, shot.height)
      return { text: shot.text, ...(image ? { image } : {}) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'territory_act',
    description: '对 territory_snapshot 给出的一个 ref 做一次动作：click 是左键，type 是把控件的值整段换成 value（空字符串会清空）。不移动系统鼠标，不注入键盘。一次调用只做一件事。',
    timeoutMs: 15000,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['click', 'type'],
        description: 'click 左键，或 type 整段赋值。',
      },
      ref: { type: 'string', required: true, description: '上一张图里的 ref，例如 e3。' },
      value: { type: 'string', description: 'type 要写入的整段文字，可以包含换行。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      if (exec?.signal?.aborted) throw new Error('cancelled')
      const result = await session.act(args || {})
      return { text: result.text }
    },
  }))
}

async function attach(ctx, png, width, height) {
  if (!png || png.length === 0) return null
  const attachments = ctx.get?.('attachments')
  if (!attachments || typeof attachments.saveImage !== 'function') return null
  try {
    const saved = await attachments.saveImage({ data: png, mediaType: 'image/png', name: 'territory.png' })
    return {
      attachmentId: String(saved.attachmentId),
      mediaType: saved.mediaType,
      bytes: saved.bytes,
      width: saved.width || width,
      height: saved.height || height,
      ...(saved.name === undefined ? {} : { name: saved.name }),
    }
  } catch {
    return null
  }
}
