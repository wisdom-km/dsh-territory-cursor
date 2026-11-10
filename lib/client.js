window.__ModuleLoader__.load({
  id: 'dsh-territory-cursor',
  factory(require) {
    const React = require('react')
    function TerritorySettings() {
      return React.createElement(
        'section',
        { 'aria-label': '地盘光标' },
        React.createElement('h2', null, '地盘光标'),
        React.createElement('p', null, '地盘还没确认。这一步只打开设置页。'),
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
