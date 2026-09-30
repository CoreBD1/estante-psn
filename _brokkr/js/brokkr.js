/* Brokkr — o JS comum de toda tela. Pequeno de propósito.
   igMorph(fn): troca de estado por metamorfose (View Transitions); sem suporte, troca seca. */
window.igMorph = window.igMorph || function (fn) {
  var lento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (document.startViewTransition && !lento) ? document.startViewTransition(fn) : fn();
};
/* Alpine: $morph(() => ...) dentro de qualquer x-data faz a troca animada. */
document.addEventListener('alpine:init', function () {
  Alpine.magic('morph', function () { return function (fn) { return igMorph(fn); }; });
});
/* Líquido: a lente SVG entra sozinha, uma vez por página (ninguém cola <svg> à mão). */
document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('bd1-lq-lens')) return;
  document.body.insertAdjacentHTML('afterbegin',
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<filter id="bd1-lq-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.010 0.014" numOctaves="1" seed="4" result="n"/>' +
    '<feGaussianBlur in="n" stdDeviation="3" result="s"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="s" scale="12" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter>' +
    '<filter id="bd1-lq-lens-fina" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.008 0.011" numOctaves="1" seed="4" result="n"/>' +
    '<feGaussianBlur in="n" stdDeviation="3" result="s"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="s" scale="4" xChannelSelector="R" yChannelSelector="G"/>' +
    '</filter></defs></svg>');
});
/* igGota(el): a gota pinga (troca de estado). No Alpine: x-gota="estado" pinga sozinha quando o estado muda. */
window.igGota = function (el) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.classList.remove('is-drop'); void el.offsetWidth; el.classList.add('is-drop');
};
document.addEventListener('alpine:init', function () {
  Alpine.directive('gota', function (el, d, u) {
    var ler = u.evaluateLater(d.expression), antes;
    u.effect(function () {
      ler(function (v) {
        el.classList.remove('ig-bead--ok', 'ig-bead--warn', 'ig-bead--crit', 'ig-bead--off', 'ig-bead--cyan');
        if (v && v !== 'ok') el.classList.add('ig-bead--' + v);
        if (antes !== undefined && antes !== v) igGota(el);
        antes = v;
      });
    });
  });
});

/* igVU(el, v): VU de células pelo dado (0..1). Cápsula de pico segura 0,9 s e desce devagar. */
window.igVU = function (el, v) {
  var n = +el.dataset.celas || 24, cs = el.children;
  if (cs.length !== n) { el.innerHTML = ''; for (var k = 0; k < n; k++) { var c = document.createElement('i');
    if (k >= n * .8) c.className = 'alto'; if (k >= n * .92) c.className = 'limite'; el.appendChild(c); } cs = el.children; }
  var on = Math.round(Math.max(0, Math.min(1, v)) * n), pk = el._pk || 0;
  for (var j = 0; j < n; j++) cs[j].classList.toggle('on', j < on);
  if (on >= pk) { pk = on; el._segura = Date.now() + 900; }
  el._pk = pk; clearInterval(el._t);
  var marca = function () { for (var j = 0; j < n; j++) cs[j].classList.toggle('pico', j === el._pk - 1 && el._pk > 0); };
  marca();
  el._t = setInterval(function () { if (Date.now() < el._segura) return;
    if (el._pk > on) { el._pk--; marca(); } else clearInterval(el._t); }, 120);
};
/* Alpine: x-vu="valor/maximo" acende o VU pelo dado. */
document.addEventListener('alpine:init', function () {
  Alpine.directive('vu', function (el, d, u) {
    var ler = u.evaluateLater(d.expression);
    u.effect(function () { ler(function (v) { igVU(el, +v || 0); }); });
  });
});
/* VU que o Go já desenhou com data-v acende sozinho na carga. */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.ig-vu-celas[data-v]').forEach(function (el) { igVU(el, +el.dataset.v); });
});
