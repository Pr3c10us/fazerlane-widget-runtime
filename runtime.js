(function (global) {
  'use strict';

  // ---------- §4 dragging ----------
  function draggable(el, onMove, onEnd) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', function (e) {
      el.setPointerCapture(e.pointerId);
      var move = function (ev) { onMove(ev.clientX, ev.clientY); };
      var up = function (ev) {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        if (onEnd) onEnd(ev.clientX, ev.clientY);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }

  function scale(min, max, px0, px1, log) {
    return function (v) {
      var t = log
        ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))
        : (v - min) / (max - min);
      return px0 + t * (px1 - px0);
    };
  }

  function snap(v, step, min) { return min + Math.round((v - min) / step) * step; }

  // ---------- §6 grading lock ----------
  // One graded flag per widget instance (not global — a page could host >1 widget).
  function createGate(sceneLayerEl) {
    var graded = false;
    function gate(fn) {
      return function () { if (!graded) fn.apply(null, arguments); };
    }
    function setGraded(on) {
      graded = on;
      if (sceneLayerEl) sceneLayerEl.style.pointerEvents = on ? 'none' : '';
    }
    function isGraded() { return graded; }
    return { gate: gate, setGraded: setGraded, isGraded: isGraded };
  }

  // ---------- §4 readiness ----------
  function markReady(buttonEl, isComplete) {
    return function () {
      var ready = isComplete();
      buttonEl.disabled = !ready;
      buttonEl.className = 'wgt-btn ' + (ready ? 'primary' : 'disabled');
    };
  }

  // ---------- §4 check wiring ----------
  function wireCheck(buttonEl, opts) {
    // opts: { evaluate, render, onPass, onFail, setGraded }
    var resolved = false;
    buttonEl.addEventListener('click', function () {
      if (resolved || buttonEl.disabled) return;
      opts.setGraded(true);
      if (opts.render) opts.render();
      if (opts.evaluate()) {
        resolved = true;
        opts.onPass();
      } else if (opts.onFail) {
        opts.onFail();
      }
    });
  }

  // ---------- §4/§6 paint-then-emit ----------
  function paintThenEmit(paint, after) {
    paint();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { after(); });
    });
  }

  // ---------- §4 resolution animation ----------
  // interpolate a set of numeric fields from `from` to `to` over duration ms.
  function animateTo(from, to, duration, onFrame, onDone) {
    var start = null;
    var keys = Object.keys(to);
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      var e = easeOut(t);
      var frame = {};
      keys.forEach(function (k) {
        var a = from[k], b = to[k];
        frame[k] = (typeof a === 'number' && typeof b === 'number') ? a + (b - a) * e : (t < 1 ? a : b);
      });
      onFrame(frame);
      if (t < 1) requestAnimationFrame(step); else if (onDone) onDone();
    }
    requestAnimationFrame(step);
  }

  // ---------- §7 result badge (SVG), anchored to a graded element ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function drawBadge(svgRoot, x, y, outcome) {
    // outcome: 'pass' | 'fail'. Returns the <g> so caller can remove it later.
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', outcome === 'pass' ? 'wgt-badge-pass' : 'wgt-badge-fail');
    g.setAttribute('transform', 'translate(' + x + ',' + y + ')');
    var rect = document.createElementNS(SVGNS, 'rect');
    rect.setAttribute('width', '20'); rect.setAttribute('height', '20'); rect.setAttribute('rx', '4');
    g.appendChild(rect);
    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', outcome === 'pass' ? 'M5 10 L9 14 L15 6' : 'M5 5 L15 15 M15 5 L5 15');
    g.appendChild(path);
    svgRoot.appendChild(g);
    return g;
  }
  function clearBadge(g) { if (g && g.parentNode) g.parentNode.removeChild(g); }
  function outlineEl(el, outcome) {
    el.classList.remove('wgt-outline-pass', 'wgt-outline-fail');
    if (outcome) el.classList.add(outcome === 'pass' ? 'wgt-outline-pass' : 'wgt-outline-fail');
  }

  // ---------- §7 action row state machine ----------
  // Rebuilds .wgt-actions wholesale for each state. Buttons hold no state.
  function rowSwap(actionsEl, state, handlers) {
    // state: 'ungraded' | 'failed' | 'solved' | 'revealed' | 'commit'
    actionsEl.setAttribute('data-state', state);
    actionsEl.innerHTML = '';
    function btn(label, cls, onClick, disabled) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = 'wgt-btn ' + cls;
      if (disabled) b.disabled = true;
      if (onClick) b.addEventListener('click', onClick);
      return b;
    }
    if (state === 'ungraded') {
      var checkLabel = handlers.checkLabel || 'Check'; // 'Run' for execution mechanics
      var b = btn(checkLabel, 'disabled', handlers.onCheck, true);
      handlers.registerCheckButton && handlers.registerCheckButton(b);
      actionsEl.appendChild(b);
    } else if (state === 'failed') {
      actionsEl.appendChild(btn('See answer', 'secondary', handlers.onSeeAnswer));
      actionsEl.appendChild(btn('Try again', 'primary', handlers.onTryAgain));
    } else if (state === 'solved' || state === 'revealed') {
      if (handlers.hasExplanation) {
        actionsEl.appendChild(btn('Why?', 'secondary', handlers.onWhy));
        actionsEl.appendChild(btn('Continue', 'accent', handlers.onContinue));
      } else {
        actionsEl.style.gridTemplateColumns = 'minmax(0, 1fr)';
        actionsEl.appendChild(btn('Continue', 'accent', handlers.onContinue));
      }
    } else if (state === 'commit') {
      actionsEl.appendChild(btn('Continue', 'accent', handlers.onContinue));
    }
  }

  // ---------- §6 Why? modal ----------
  function buildModal(wgtRoot, explanationText) {
    var overlay = document.createElement('div');
    overlay.className = 'wgt-modal';
    var panel = document.createElement('div');
    panel.className = 'wgt-modal-panel';
    var title = document.createElement('p');
    title.className = 'wgt-modal-title';
    title.textContent = 'Explanation';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'wgt-modal-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00D7';
    var body = document.createElement('p');
    body.className = 'wgt-modal-body';
    body.textContent = explanationText;
    panel.appendChild(close);
    panel.appendChild(title);
    panel.appendChild(body);
    overlay.appendChild(panel);
    wgtRoot.appendChild(overlay);
    function open() { overlay.classList.add('open'); }
    function closeFn() { overlay.classList.remove('open'); }
    close.addEventListener('click', closeFn);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeFn(); });
    return { open: open, close: closeFn };
  }

  // ---------- §5 seeded PRNG ----------
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = t;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- §10 sound ----------
  var SFX_BASE = 'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/'
               + '4596a49eaf5a533948d49a47467f606bcdea70ff/addons/kenney_interface_sounds/';
  var SFX = {
    grab:  { file: 'click_003.wav',        gain: 0.30, throttle: 40  },
    snap:  { file: 'click_002.wav',        gain: 0.35, throttle: 30  },
    seat:  { file: 'drop_003.wav',         gain: 0.40, throttle: 60  },
    step:  { file: 'tick_002.wav',         gain: 0.25, throttle: 30  },
    pass:  { file: 'confirmation_001.wav', gain: 0.50, throttle: 300 },
    fail:  { file: 'question_002.wav',     gain: 0.40, throttle: 300 }
  };
  var actx = null, buffers = {}, lastPlayed = {};

  function initAudio() {
    if (actx) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    actx = new AC({ latencyHint: 'interactive' });
    if (actx.state === 'suspended') actx.resume();
    var warm = actx.createBufferSource();
    warm.buffer = actx.createBuffer(1, 1, actx.sampleRate);
    warm.connect(actx.destination);
    warm.start(0);
    Object.keys(SFX).forEach(function (name) {
      fetch(SFX_BASE + SFX[name].file)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return actx.decodeAudioData(b); })
        .then(function (buf) { buffers[name] = buf; })
        .catch(function () {});
    });
  }

  function play(name) {
    if (!actx || !buffers[name]) return;
    var spec = SFX[name];
    var now = performance.now();
    if (lastPlayed[name] && now - lastPlayed[name] < spec.throttle) return;
    lastPlayed[name] = now;
    var t0 = actx.currentTime + 0.02;
    var src = actx.createBufferSource();
    var gain = actx.createGain();
    src.buffer = buffers[name];
    gain.gain.setValueAtTime(spec.gain, t0);
    src.connect(gain).connect(actx.destination);
    src.start(t0);
    src.stop(t0 + buffers[name].duration + 0.02);
  }

  function attachAudioWarmup(rootEl) {
    rootEl.addEventListener('pointerdown', initAudio, { capture: true, once: true });
  }

  // ---------- §7a skeleton builder ----------
  function buildSkeleton(mountEl) {
    mountEl.innerHTML =
      '<div class="wgt">' +
        '<div class="wgt-stage">' +
          '<p class="wgt-prompt"></p>' +
          '<div class="wgt-scene"></div>' +
          '<button class="wgt-startover" type="button">\u21BA Start over</button>' +
        '</div>' +
        '<div class="wgt-actions"></div>' +
      '</div>';
    var root = mountEl.querySelector('.wgt');
    return {
      root: root,
      stage: root.querySelector('.wgt-stage'),
      prompt: root.querySelector('.wgt-prompt'),
      scene: root.querySelector('.wgt-scene'),
      startOver: root.querySelector('.wgt-startover'),
      actions: root.querySelector('.wgt-actions')
    };
  }

  global.WidgetRuntime = {
    draggable: draggable,
    scale: scale,
    snap: snap,
    createGate: createGate,
    markReady: markReady,
    wireCheck: wireCheck,
    paintThenEmit: paintThenEmit,
    animateTo: animateTo,
    drawBadge: drawBadge,
    clearBadge: clearBadge,
    outlineEl: outlineEl,
    rowSwap: rowSwap,
    buildModal: buildModal,
    mulberry32: mulberry32,
    attachAudioWarmup: attachAudioWarmup,
    play: play,
    buildSkeleton: buildSkeleton
  };
})(window);