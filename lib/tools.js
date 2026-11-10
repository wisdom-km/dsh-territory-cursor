/**
 * Register the agent tools. `defineTool` is passed in so tests do not load the host package.
 * Territory tools do not move the system mouse.
 * desktop_step and get_screen_metrics follow dsh-desktop-tools-plugin 0.4.0 (EvilOfRed, MIT). See NOTICE.
 * @param {object} ctx
 * @param {{ snapshot: Function, act: Function, desktopStep: Function, desktopMetrics: Function }} session
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
          image: { type: 'object', additionalProperties: true },
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

  ctx.tools.register(defineTool({
    name: 'desktop_step',
    description: '看整块虚拟桌面，按顺序做一批真实的鼠标和键盘动作，再带回新的全屏画面。坐标原点在主显示器左上角，向左或向上为负。省略 actions 就只看一眼。同一批动作中间不回传画面。有先后依赖的操作要拆成两次调用。使用前必须先问用户是否允许操作桌面。不再使用后必须告诉用户已经结束。这一步会移动系统鼠标。思路借鉴 dsh-desktop-tools-plugin 0.4.0（EvilOfRed，MIT）。地盘里的 territory_act 仍然不移动系统鼠标。',
    timeoutMs: 90000,
    parameters: {
      watch: {
        type: 'array',
        description: '监视区：1 到 4 个矩形，虚拟桌面物理像素。动作之前先记下这些矩形，动作之后一变化就返回。省略则动作后静置 0.1 秒再截图。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            x: { type: 'integer', required: true, description: '矩形左上角横坐标，可以为负。' },
            y: { type: 'integer', required: true, description: '矩形左上角纵坐标，可以为负。' },
            width: { type: 'integer', required: true, description: '矩形宽度，正数。' },
            height: { type: 'integer', required: true, description: '矩形高度，正数。' },
          },
        },
      },
      actions: {
        type: 'array',
        description: '按顺序执行，最多 20 个。省略或空数组表示不操作。kind：move、click、text、key、scroll、wait。',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: {
              type: 'string',
              required: true,
              enum: ['move', 'click', 'text', 'key', 'scroll', 'wait'],
              description: 'move 移动光标，click 单击或双击，text 输入文字，key 按键，scroll 滚轮，wait 等待。',
            },
            x: { type: 'integer', description: '横坐标。move 必填。click 和 scroll 可以省略，表示用当前光标。x 和 y 要成对给出。' },
            y: { type: 'integer', description: '纵坐标，与 x 成对给出。' },
            duration_ms: { type: 'integer', description: 'move 的滑动毫秒数，0 到 10000。0 或不给表示瞬间到位。' },
            button: { type: 'string', enum: ['left', 'right'], description: 'click 的按键，默认 left。' },
            count: { type: 'integer', enum: [1, 2], description: 'click 次数。1 单击，2 双击。' },
            text: { type: 'string', description: 'text 要输入的文字，最多 20000 字符。不使用剪贴板。' },
            submit: { type: 'boolean', description: 'text 输入后是否再按回车。' },
            key: { type: 'string', description: 'key 的键名或组合，例如 ctrl+a、ctrl+shift+tab、alt+f4，或单个 ASCII 字符。' },
            repeat: { type: 'integer', description: 'key 的连按次数，1 到 50。' },
            direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'scroll 的方向。' },
            amount: { type: 'integer', description: 'scroll 的格数，1 到 50，默认 3。' },
            ms: { type: 'integer', description: 'wait 的毫秒数，0 到 10000。' },
          },
        },
      },
      timeout_ms: { type: 'integer', description: '监视区最长等待，0 到 2000 毫秒，默认 2000。0 表示完全不等待。' },
      annotate: { type: 'boolean', description: '默认 true。红框是监视区，绿圈是左键，橙圈是右键，青色十字是当前光标。' },
      grid: { type: 'boolean', description: '默认 false。叠加 200 像素网格，刻度是虚拟桌面坐标。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          image: { type: 'object', additionalProperties: true },
        },
      },
      render: (_args, value) => {
        const blocks = [{ type: 'text', text: value.text }]
        if (value.image) blocks.push({ type: 'image', attachment: value.image })
        return blocks
      },
    },
    async execute(args, exec) {
      if (exec?.signal?.aborted) throw new Error('cancelled')
      const shot = await session.desktopStep(args || {}, exec?.signal)
      const image = await attach(ctx, shot.png, shot.width, shot.height, 'desktop-step.png')
      let text = shot.text
      if (image?.originalDimensions) {
        text += `\n附加的图像已缩到 ${image.width}×${image.height}，图上坐标要按比例换回屏幕坐标。`
      }
      return { text, ...(image ? { image } : {}) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'get_screen_metrics',
    description: '只读。返回虚拟桌面范围、每块显示器的矩形、光标位置和前台窗口标题。用它确定 desktop_step 的坐标范围。这一步不移动鼠标。思路借鉴 dsh-desktop-tools-plugin 0.4.0（EvilOfRed，MIT）。',
    timeoutMs: 15000,
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(_args, exec) {
      if (exec?.signal?.aborted) throw new Error('cancelled')
      const result = await session.desktopMetrics()
      return { text: result.text }
    },
  }))
}

async function attach(ctx, png, width, height, name = 'territory.png') {
  if (!png || png.length === 0) return null
  const attachments = ctx.get?.('attachments')
  if (!attachments || typeof attachments.saveImage !== 'function') return null
  try {
    const saved = await attachments.saveImage({ data: png, mediaType: 'image/png', name })
    const image = {
      attachmentId: String(saved.attachmentId),
      mediaType: saved.mediaType,
      bytes: saved.bytes,
      width: saved.width || width,
      height: saved.height || height,
      ...(saved.name === undefined ? {} : { name: saved.name }),
    }
    if (width && height && (image.width !== width || image.height !== height)) {
      image.originalDimensions = { width, height }
    }
    return image
  } catch {
    return null
  }
}
