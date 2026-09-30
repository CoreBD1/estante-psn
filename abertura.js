/* A abertura da Estante PSN: a sala acende (Rive, desenhada em 3D por código — rive/gera_abertura.py).
   Regras: toca uma vez por visita; nunca prende quem chega (se o Rive não carregar em 1,4 s,
   a cortina sai e a página abre como sempre); um toque pula; movimento reduzido não vê nada. */
(function () {
  var html = document.documentElement, caixa = document.getElementById("abertura");
  if (!caixa || !html.classList.contains("abre")) { if (caixa) caixa.remove(); return; }
  var base = caixa.dataset.rive, r = null, saiu = false, tocou = false;

  function sai() {
    if (saiu) return; saiu = true;
    try { sessionStorage.setItem("estante-abertura", "1"); } catch (e) {}
    html.classList.remove("abre");                     /* a sala começa a entrar por baixo */
    caixa.classList.add("sai");
    setTimeout(function () { try { r && r.cleanup(); } catch (e) {} caixa.remove(); }, 560);
  }
  var desiste = setTimeout(function () { if (!tocou) sai(); }, 1400);   /* no ar, o Rive chegou em 0,87 s */
  caixa.addEventListener("pointerdown", sai);
  addEventListener("keydown", sai, { once: true });

  var s = document.createElement("script");
  s.src = base + "rive-umd.js";
  s.onerror = sai;
  s.onload = function () {
    if (saiu || !window.rive) return sai();
    var cv = caixa.querySelector("canvas");
    try {
      rive.RuntimeLoader.setWasmUrl(base + "rive.wasm");
      r = new rive.Rive({
        src: caixa.dataset.riv, canvas: cv, autoplay: true, stateMachine: "abertura",
        layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
        onLoad: function () {
          if (saiu) return;
          tocou = true; clearTimeout(desiste);
          r.resizeDrawingSurfaceToCanvas();
          caixa.classList.add("tocando");
          setTimeout(sai, 1650);                          /* 1,6 s de luz acendendo e sai */
        },
        onLoadError: sai
      });
    } catch (e) { sai(); }
  };
  document.head.appendChild(s);
})();
