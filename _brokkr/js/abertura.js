/* A abertura Rive. O nicho gravado já está desenhado no CSS: sem Rive (wasm bloqueado,
   arquivo ausente, movimento reduzido) a página não perde nada.
   Cada nicho pode escolher a peça:  data-riv="robo.riv"  data-maquina="estado"
   data-chegada="2" (valor que a máquina recebe ao abrir; volta a 0 depois de 2,2 s). */
(function () {
  var nichos = document.querySelectorAll('[data-abertura]');
  if (!nichos.length) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var base = document.currentScript ? document.currentScript.dataset.rive : '';
  var s = document.createElement('script');
  s.src = base + 'rive-umd.js';
  s.onload = function () { nichos.forEach(monta); };
  document.head.appendChild(s);

  function monta(nicho) {
    var cv = nicho.querySelector('canvas');
    if (!cv || !window.rive) return;
    var d = nicho.dataset, sm = d.maquina || 'estado';
    try {
      rive.RuntimeLoader.setWasmUrl(base + 'rive.wasm');
      var r = new rive.Rive({
        src: base + (d.riv || 'robo.riv'), canvas: cv, autoplay: true, stateMachines: sm,
        layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
        onLoad: function () {
          r.resizeDrawingSurfaceToCanvas();
          var e = (r.stateMachineInputs(sm) || []).filter(function (i) { return i.name === sm; })[0];
          if (!e) return;
          e.value = +(d.chegada || 2);
          setTimeout(function () { e.value = 0; }, 2200);
        }
      });
    } catch (x) { /* a tela vale sem a peça */ }
  }
})();
