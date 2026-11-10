window.__ModuleLoader__.load({
  id: 'dsh-territory-cursor',
  factory(require) {
    const React = require('react')

    function parseScreens(value) {
      try {
        const screens = JSON.parse(value || '[]')
        return Array.isArray(screens) ? screens : []
      } catch {
        return []
      }
    }

    function TerritorySettings(props) {
      const [side, setSide] = React.useState('right')
      const [fraction, setFraction] = React.useState(0.5)
      const [note, setNote] = React.useState('')
      const view = props && props.view
      const form = props && props.form
      const state = form && form.state
      const value = state && state.value ? state.value : {}
      const screens = parseScreens(value.screensJson)
      const confirmed = Boolean(value.confirmed)
      if (view === 'summary') {
        return confirmed ? '地盘已确认' : '地盘还没确认。先在这里选定地盘。'
      }
      async function write(ops) {
        if (!form || !state || !state.writable) {
          setNote('现在不能写入设置。')
          return
        }
        const ok = await form.mutate(ops, state.revision)
        setNote(ok ? '已写入，下一轮才用新地盘。' : '没有写入。')
      }
      const choices = screens.map(screen => ({
        ...screen,
        label: `${screen.device} ${screen.width}×${screen.height}`,
      }))
      return React.createElement(
        'section',
        { 'aria-label': '地盘光标' },
        React.createElement('h2', null, '地盘光标'),
        React.createElement('p', null, confirmed
          ? (screens.length >= 2 ? '地盘是选定的整块屏幕。' : '地盘是这块屏幕的半边。')
          : '地盘还没确认。先在这里选定地盘。'),
        choices.length === 0
          ? React.createElement('p', null, '正在读取屏幕。')
          : React.createElement('ul', null, choices.map(screen => React.createElement(
            'li',
            { key: screen.device },
            React.createElement('button', {
              type: 'button',
              onClick: () => write([
                { op: 'set', path: ['confirmed'], value: true },
                { op: 'set', path: ['device'], value: screen.device },
                { op: 'set', path: ['screenCount'], value: screens.length },
                { op: 'set', path: ['originX'], value: screen.x },
                { op: 'set', path: ['originY'], value: screen.y },
                { op: 'set', path: ['side'], value: screens.length >= 2 ? 'right' : side },
                { op: 'set', path: ['fraction'], value: screens.length >= 2 ? 0.5 : Number(fraction) },
              ]),
            }, `确认地盘 ${screen.label}`),
          ))),
        screens.length < 2 ? React.createElement('div', null,
          [['left', '左半边'], ['right', '右半边'], ['top', '上半边'], ['bottom', '下半边']].map(([item, label]) => React.createElement('button', {
            type: 'button',
            key: item,
            onClick: () => setSide(item),
          }, side === item ? `已选${label}` : label)),
          React.createElement('input', {
            'aria-label': '分界',
            type: 'range',
            min: '0.05',
            max: '0.95',
            step: '0.01',
            value: fraction,
            onChange: event => setFraction(event.target.value),
          }),
        ) : null,
        React.createElement('button', {
          type: 'button',
          onClick: () => write([{ op: 'set', path: ['stopped'], value: !value.stopped }]),
        }, value.stopped ? '已停止' : '停止'),
        confirmed ? React.createElement('button', {
          type: 'button',
          onClick: () => write([{ op: 'set', path: ['confirmed'], value: false }]),
        }, '重新选择') : null,
        note ? React.createElement('p', null, note) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('plugins.item', () => ctx.slots.register({
          name: 'plugins.item',
          id: 'territory-cursor',
          order: 80,
          label: '地盘光标',
        }, TerritorySettings))
      },
    }
  },
})
