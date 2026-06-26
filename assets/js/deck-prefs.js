/* Arline Arcade — deck preferences (card-back colour; built to extend later).
   Saved in localStorage and applied as a data-attribute on <html>; the CSS does the
   rest. If the player never opens settings, nothing changes — the deck looks exactly
   the same out of the box. Any element with [data-settings] opens the panel. */
(function () {
  var KEY = 'arline-deck-prefs';
  var BACKS = [
    { id: 'blue', label: 'Blue' },
    { id: 'red', label: 'Red' },
    { id: 'green', label: 'Green' },
    { id: 'purple', label: 'Purple' },
    { id: 'charcoal', label: 'Charcoal' },
    { id: 'burgundy', label: 'Burgundy' }
  ];
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  function apply(p) { document.documentElement.dataset.back = p.back || 'blue'; }

  var prefs = load();
  apply(prefs);

  function backImg(id) {
    return '../../assets/cards/royal/' + (id === 'blue' ? 'back.jpg' : 'back-' + id + '.jpg');
  }

  function open() {
    if (document.getElementById('deck-settings')) return;
    var cur = prefs.back || 'blue';
    var ov = document.createElement('div');
    ov.id = 'deck-settings';
    ov.className = 'ds-overlay';
    ov.innerHTML =
      '<div class="ds-panel" role="dialog" aria-label="Settings" aria-modal="true">' +
        '<button class="ds-close" aria-label="Close">&times;</button>' +
        '<h2>Card back</h2>' +
        '<div class="ds-swatches">' +
          BACKS.map(function (b) {
            return '<button class="ds-swatch' + (cur === b.id ? ' sel' : '') + '" data-id="' + b.id +
              '" aria-label="' + b.label + '"><img src="' + backImg(b.id) + '" alt="" loading="lazy">' +
              '<span>' + b.label + '</span></button>';
          }).join('') +
        '</div>' +
      '</div>';
    function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('.ds-close')) close(); });
    document.addEventListener('keydown', onKey);
    ov.querySelectorAll('.ds-swatch').forEach(function (s) {
      s.addEventListener('click', function () {
        prefs.back = s.dataset.id; save(prefs); apply(prefs);
        ov.querySelectorAll('.ds-swatch').forEach(function (x) { x.classList.toggle('sel', x === s); });
      });
    });
    document.body.appendChild(ov);
  }

  window.DeckPrefs = { open: open };
  document.addEventListener('click', function (e) { if (e.target.closest('[data-settings]')) open(); });
})();
