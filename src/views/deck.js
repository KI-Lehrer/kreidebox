// Arbeitsfläche (S01): stage, widgets, selection, drag/resize, keyboard, autosave.
import * as store from '../data/store.js';
import { h, iconEl, iconButton, isTyping, modKey } from '../ui/dom.js';
import { toast, confirmDialog, promptDialog, showMenu, closeMenu, openPanel, closePanel, panelOpenFor, section } from '../ui/overlays.js';
import { WIDGETS, BAR, MORE, isBuilt } from '../widgets/registry.js';
import { advance } from '../widgets/timer.js';
import { BACKGROUNDS, backgroundCss, resolveBackground, sameBackground, SLIDE_INTERVALS, slideIndex } from '../backgrounds.js';
import { applyWidgetTheme } from '../widgets/themes.js';
import { loadThemes, saveTemplate, listTemplates, screenFromTemplate } from '../data/library.js';
import { BUILTIN, builtinScreen } from '../data/builtin-templates.js';
import { exportDecks, exportScreens, importFile, pickImportFile } from '../data/transfer.js';
import { putUpload, listUploads, deleteUpload, pickFile, getUploadUrl } from '../data/uploads.js';
import { formatBytes } from '../ui/dom.js';
import { unlockAudio, playSound } from '../audio.js';
import { attachInk, INK_COLORS, INK_SIZES } from '../ui/ink.js';

const STAGE_H = 1080;
const SAVE_DELAY = 400;
let widgetClipboard = null; // copy/paste between screens and decks

export async function renderDeck(root, deckId, screenIndex = 0) {
  const deck = await store.getDeck(deckId);
  if (!deck) { toast('Dieses Deck gibt es nicht mehr.'); location.hash = '#/'; return () => {}; }
  await loadThemes();

  let STAGE_W = deck.aspectRatio === '4:3' ? 1440 : 1920;
  let si = Math.min(Math.max(0, screenIndex), deck.screens.length - 1);
  let selectedId = null; // the one selected widget (null when nothing or several are selected)
  let sel = new Set();    // all selected widget ids
  let scale = 1;
  let barHidden = false;
  const mounted = new Map(); // widget id -> { frame, content, inst, w, def }
  const cleanups = [];
  const screen = () => deck.screens[si];
  const allWidgets = () => [...deck.pinnedWidgets, ...screen().widgets];
  const findWidget = (id) => allWidgets().find((w) => w.id === id);
  const listOf = (w) => (deck.pinnedWidgets.includes(w) ? deck.pinnedWidgets : screen().widgets);

  // ---------- autosave ----------
  let saveTimer = null; let saving = Promise.resolve();
  const saveState = h('span', { class: 'savestate', role: 'status', 'aria-live': 'polite' }, 'Gespeichert');
  let restoring = false;
  function changed() {
    if (!restoring) recordSoon();
    saveState.textContent = 'Wird gespeichert …';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DELAY);
  }
  function flush() {
    if (!saveTimer) return saving;
    clearTimeout(saveTimer); saveTimer = null;
    saving = store.saveDeck(deck)
      .then(() => { saveState.textContent = 'Gespeichert'; })
      .catch((err) => { saveState.textContent = 'Nicht gespeichert'; toast('Speichern fehlgeschlagen: ' + (err && err.message ? err.message : 'unbekannter Fehler')); });
    return saving;
  }
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  addEventListener('pagehide', flush); document.addEventListener('visibilitychange', onHide);
  cleanups.push(() => { removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); });

  // ---------- DOM ----------
  const stage = h('div', { class: 'stage', role: 'region', 'aria-label': 'Bildschirm' });
  stage.style.width = STAGE_W + 'px';
  const inkCanvas = h('canvas', { class: 'ink-layer', 'aria-hidden': 'true' });
  const spotScrim = h('div', { class: 'spot-scrim', hidden: true, onClick: () => endSpotlight() });
  stage.append(inkCanvas, spotScrim);
  const blurCover = h('div', { class: 'blur-cover no-print', hidden: true, role: 'dialog', 'aria-label': 'Bildschirm verborgen' },
    h('div', { class: 'blur-cover__box' }, iconEl('eye-off', { size: 40 }), h('p', null, 'Bildschirm verborgen'), h('button', { class: 'btn btn--primary', type: 'button', onClick: () => setBlur(false) }, 'Wieder zeigen')));
  const stageWrap = h('div', { class: 'stage-wrap' }, stage);
  const selLayer = h('div', { class: 'sel-layer no-print' });
  const nameEl = h('span', { class: 'deckname' }, deck.name);
  const fsBtn = iconButton('maximize', 'Vollbild', { cls: 'iconbtn--surface', kbd: 'F', onClick: toggleFullscreen });
  const optBtn = iconButton('ellipsis-vertical', 'Optionen', { cls: 'iconbtn--surface', onClick: () => openOptions() });
  optBtn.setAttribute('aria-haspopup', 'menu');
  const tl = h('div', { class: 'corner corner--tl no-print' },
    h('a', { class: 'iconbtn iconbtn--surface', href: '#/', 'aria-label': 'Zur Übersicht', title: 'Zur Übersicht' }, iconEl('house')),
    h('div', { class: 'deckmeta' }, nameEl, saveState));
  const tr = h('div', { class: 'corner corner--tr no-print' }, fsBtn, optBtn);

  const navOut = h('output', { 'aria-live': 'polite' });
  const prevBtn = iconButton('chevron-left', 'Vorheriger Bildschirm', { cls: 'iconbtn--sm', kbd: '←', onClick: () => goTo(si - 1) });
  const nextBtn = iconButton('chevron-right', 'Nächster Bildschirm', { cls: 'iconbtn--sm', kbd: '→', onClick: () => goTo(si + 1) });
  const addBtn = iconButton('plus', 'Neuer Bildschirm', { cls: 'iconbtn--sm', kbd: modKey + '+Enter', onClick: addScreen });
  const nav = h('nav', { class: 'snav corner corner--br no-print', 'aria-label': 'Bildschirme' }, prevBtn, navOut, nextBtn, addBtn);
  const printBtn = iconButton('printer', 'Bildschirm als PDF drucken (A4 quer)', { cls: 'iconbtn--sm printbtn', onClick: () => printScreen() });
  const bl = h('div', { class: 'corner corner--bl no-print' }, printBtn);

  const barButtons = new Map();
  const bar = h('div', { class: 'wbar', role: 'toolbar', 'aria-label': 'Widgets' });
  const penBtn = h('button', { class: 'wbtn wbtn--tool', type: 'button', 'aria-label': 'Zeichnen über allem', title: 'Zeichnen über allem', 'aria-pressed': 'false', onClick: () => setAnnot(!annot.on) },
    iconEl('pencil-line', { size: 26 }), h('span', { 'aria-hidden': 'true' }, 'Stift'));
  bar.append(penBtn, h('span', { class: 'wbar__sep', 'aria-hidden': 'true' }));
  for (const item of BAR) bar.append(barButton(item));
  const moreBtn = h('button', { class: 'wbtn', type: 'button', 'aria-label': 'Weitere Widgets', 'aria-haspopup': 'menu', onClick: () => openMore() }, iconEl('layout-grid', { size: 26 }), h('span', { 'aria-hidden': 'true' }, 'Mehr'));
  bar.append(moreBtn);
  const hideBarBtn = iconButton('chevron-down', 'Leiste ausblenden', { cls: 'iconbtn--sm', kbd: 'B', onClick: () => toggleBar() });
  bar.append(h('div', { class: 'wbar__end' }, hideBarBtn));
  const showBarBtn = h('button', { class: 'wbar-show iconbtn iconbtn--surface no-print', type: 'button', 'aria-label': 'Widget-Leiste zeigen', title: 'Widget-Leiste zeigen (B)', hidden: true, onClick: () => toggleBar() }, iconEl('layout-grid'));
  const barWrap = h('div', { class: 'wbar-wrap no-print' }, bar, showBarBtn);

  // annotation toolbar (drawing over everything)
  const annot = { on: false, tool: 'pen', color: INK_COLORS[1], size: 1 };
  const aTools = [['pen', 'Stift', 'pencil', 'M'], ['marker', 'Textmarker', 'highlighter', 'H'], ['line', 'Linie', 'ruler', 'L'], ['eraser', 'Radierer', 'eraser', 'E']];
  const aToolBtns = aTools.map(([k, l, ic, key]) => h('button', { class: 'dw__tool', type: 'button', 'aria-label': `${l} (${key})`, title: `${l} (${key})`, 'aria-pressed': 'false', onClick: () => { annot.tool = k; paintAnnotBar(); } }, iconEl(ic, { size: 18 })));
  const aColorBtns = INK_COLORS.map((c) => h('button', { class: 'dw__color', type: 'button', 'aria-label': `Farbe ${c}`, style: { background: c }, 'aria-pressed': 'false', onClick: () => { annot.color = c; if (annot.tool === 'eraser') annot.tool = 'pen'; paintAnnotBar(); } }));
  const aSizeBtns = INK_SIZES.map((_, i) => h('button', { class: 'dw__size', type: 'button', 'aria-label': ['Dünn', 'Mittel', 'Dick'][i], 'aria-pressed': 'false', onClick: () => { annot.size = i; paintAnnotBar(); } }, h('i', { style: { width: `${6 + i * 6}px`, height: `${6 + i * 6}px` } })));
  const annotBar = h('div', { class: 'annot-bar no-print', role: 'toolbar', 'aria-label': 'Zeichnen über allem', hidden: true },
    h('div', { class: 'dw__group' }, aToolBtns), h('div', { class: 'dw__group' }, aColorBtns), h('div', { class: 'dw__group' }, aSizeBtns),
    h('div', { class: 'dw__group' },
      h('button', { class: 'dw__tool', type: 'button', 'aria-label': 'Letzten Strich entfernen', title: 'Letzten Strich entfernen', onClick: () => { (screen().ink || []).pop(); changed(); ink.render(); } }, iconEl('rotate-ccw', { size: 18 })),
      h('button', { class: 'dw__tool', type: 'button', 'aria-label': 'Alle Striche löschen', title: 'Alle Striche löschen', onClick: () => { if ((screen().ink || []).length) { screen().ink = []; changed(); ink.render(); } } }, iconEl('trash-2', { size: 18 }))),
    h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => setAnnot(false) }, 'Fertig (Esc)'));
  function paintAnnotBar() {
    aToolBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(aTools[i][0] === annot.tool)));
    aColorBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(INK_COLORS[i] === annot.color && annot.tool !== 'eraser')));
    aSizeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === annot.size)));
  }
  const ink = attachInk(inkCanvas, {
    getStrokes: () => screen().ink || [],
    getTool: () => ({ tool: annot.tool, color: annot.color, size: INK_SIZES[annot.size] }),
    onCommit: (st) => { screen().ink = st; changed(); },
    enabled: () => annot.on,
  });
  cleanups.push(() => ink.destroy());
  function setAnnot(on) {
    annot.on = on; select(null); closePanel();
    view.classList.toggle('is-annotating', on); annotBar.hidden = !on;
    penBtn.setAttribute('aria-pressed', String(on));
    paintAnnotBar();
    if (on) toast('Zeichnen über allem: M Stift, H Textmarker, L Linie, E Radierer, Esc fertig');
  }

  const view = h('div', { class: 'deckview' }, stageWrap, selLayer, tl, tr, bl, nav, barWrap, annotBar, blurCover);
  root.append(view);
  document.title = deck.name + ' · Kreidebox';

  // ---------- scale to window ----------
  function fit() {
    const r = stageWrap.getBoundingClientRect();
    scale = Math.min(r.width / STAGE_W, r.height / STAGE_H) || 1;
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    positionSelection();
  }
  const ro = new ResizeObserver(fit); ro.observe(stageWrap);
  cleanups.push(() => ro.disconnect());

  // ---------- render ----------
  function renderScreen() {
    closePanel();
    for (const m of mounted.values()) { m.inst.destroy && m.inst.destroy(); m.frame.remove(); }
    mounted.clear();
    spot = null; spotScrim.hidden = true; view.classList.remove('is-spot');
    applyBackground();
    allWidgets().slice().sort((a, b) => a.z - b.z).forEach(mountWidget);
    ink.render();
    sel = new Set(); selectedId = null; positionSelection();
    navOut.textContent = `${si + 1} / ${deck.screens.length}`;
    navOut.setAttribute('aria-label', `Bildschirm ${si + 1} von ${deck.screens.length}`);
    prevBtn.disabled = si === 0; nextBtn.disabled = si === deck.screens.length - 1;
    stage.setAttribute('aria-label', `Bildschirm ${si + 1} von ${deck.screens.length}`);
    updateBar();
  }

  let bgToken = 0;
  async function applyBackground() {
    const bg = screen().background; const token = ++bgToken;
    if (!(bg && bg.type === 'slideshow')) stageWrap.style.background = backgroundCss(bg);
    slideShown = bg && bg.type === 'slideshow' ? slideIndex(bg) : -1;
    if (bg && (bg.type === 'upload' || bg.type === 'slideshow')) { const css = await resolveBackground(bg); if (token === bgToken) stageWrap.style.background = css; }
  }
  let slideShown = -1;
  function tickSlideshow(now) {
    const bg = screen().background;
    if (bg && bg.type === 'slideshow' && (bg.value.uploadIds || []).length > 1 && slideIndex(bg, now) !== slideShown) applyBackground();
  }

  function mountWidget(w) {
    const def = WIDGETS[w.type];
    if (!def) return;
    const content = h('div');
    applyWidgetTheme(content, w.themeId);
    const frame = h('div', { class: 'wf', role: 'group', tabindex: '0', 'data-id': w.id }, content);
    place(frame, w);
    const entry = { frame, content, w, def, inst: null };
    const api = {
      changed,
      refresh: () => { applyWidgetTheme(content, w.themeId); entry.inst.update && entry.inst.update(); },
      setLabel: (t) => frame.setAttribute('aria-label', t + (w.locked ? ', fixiert' : '')),
      isSelected: () => selectedId === w.id,
      openSettings: () => { select(w.id, { focus: false }); openSettings(); },
      deckId: deck.id,
      instance: () => entry.inst,
    };
    entry.inst = def.mount(content, w, api);
    entry.api = api;
    mounted.set(w.id, entry);
    frame.addEventListener('pointerdown', (e) => onFramePointerDown(e, w));
    // pointer capture during drag sends the double-click to the frame, so forward it (text widget: start writing)
    frame.addEventListener('dblclick', () => { if (entry.inst.edit && !w.locked) entry.inst.edit(); });
    frame.addEventListener('focus', () => { if (!sel.has(w.id)) select(w.id, { focus: false }); });
    if (deck.pinnedWidgets.includes(w)) { frame.classList.add('is-pinned'); frame.append(h('span', { class: 'pin-badge no-print', title: 'Auf allen Bildschirmen', 'aria-hidden': 'true' }, iconEl('pin', { size: 14 }))); }
    stage.append(frame);
  }

  function place(frame, w) {
    Object.assign(frame.style, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px', zIndex: w.z, transform: w.rotation ? `rotate(${w.rotation}deg)` : '' });
  }

  // ---------- selection overlay (in screen pixels, so handles keep their size) ----------
  // selBox follows the widget (rotated with it); selAabb is the upright box that carries the toolbar.
  const handles = ['nw', 'ne', 'sw', 'se'].map((d) => h('span', { class: 'sel-handle sel-handle--' + d, 'data-dir': d, 'aria-hidden': 'true' }));
  const rotHandle = h('span', { class: 'sel-rot', 'aria-hidden': 'true', title: 'Drehen (Shift: in 15°-Schritten)' }, iconEl('rotate-cw', { size: 14 }));
  const rotOut = h('span', { class: 'sel-deg', hidden: true, 'aria-hidden': 'true' });
  const tbDelete = iconButton('trash-2', 'Entfernen', { cls: 'iconbtn--sm iconbtn--danger', kbd: 'Entf', onClick: () => removeWidget(selectedId) });
  const tbSettings = iconButton('settings', 'Einstellungen', { cls: 'iconbtn--sm', kbd: 'S', onClick: () => toggleSettings() });
  const tbMore = iconButton('ellipsis-vertical', 'Mehr', { cls: 'iconbtn--sm', onClick: () => openWidgetMenu() });
  tbMore.setAttribute('aria-haspopup', 'menu');
  const toolbar = h('div', { class: 'wtoolbar', role: 'toolbar', 'aria-label': 'Widget-Aktionen' }, tbDelete, tbSettings, tbMore);
  const mCount = h('span', { class: 'wtoolbar__count', role: 'status' });
  const mAlign = iconButton('align-start-vertical', 'Ausrichten und verteilen', { cls: 'iconbtn--sm', onClick: () => openAlignMenu() });
  mAlign.setAttribute('aria-haspopup', 'menu');
  const mGroup = iconButton('group', 'Gruppieren', { cls: 'iconbtn--sm', kbd: modKey + ' G', onClick: () => setGrouped(true) });
  const mUngroup = iconButton('ungroup', 'Gruppe auflösen', { cls: 'iconbtn--sm', kbd: modKey + ' Shift G', onClick: () => setGrouped(false) });
  const mDup = iconButton('copy', 'Alle duplizieren', { cls: 'iconbtn--sm', kbd: 'Shift D', onClick: () => duplicateSelection() });
  const mDel = iconButton('trash-2', 'Alle entfernen', { cls: 'iconbtn--sm iconbtn--danger', kbd: 'Entf', onClick: () => removeSelection() });
  const mtoolbar = h('div', { class: 'wtoolbar', role: 'toolbar', 'aria-label': 'Aktionen für die Auswahl', hidden: true }, mCount, mAlign, mGroup, mUngroup, mDup, mDel);
  const selBox = h('div', { class: 'sel-box', hidden: true }, ...handles, rotHandle);
  const selAabb = h('div', { class: 'sel-aabb', hidden: true }, toolbar, mtoolbar, rotOut);
  const marquee = h('div', { class: 'sel-marquee', hidden: true, 'aria-hidden': 'true' });
  selLayer.append(selBox, selAabb, marquee);
  handles.forEach((hd) => hd.addEventListener('pointerdown', (e) => onResizeDown(e, hd.dataset.dir)));
  rotHandle.addEventListener('pointerdown', onRotateDown);

  const selIds = () => [...sel].filter((id) => mounted.has(id));
  const selWidgets = () => selIds().map((id) => mounted.get(id).w);
  const groupOf = (w) => (w.groupId ? allWidgets().filter((x) => x.groupId === w.groupId && mounted.has(x.id)) : [w]);

  function setSelection(ids, { focus = true } = {}) {
    for (const id of sel) { const m = mounted.get(id); if (m) m.frame.classList.remove('is-selected'); }
    sel = new Set(ids.filter((id) => mounted.has(id)));
    for (const id of sel) mounted.get(id).frame.classList.add('is-selected');
    selectedId = sel.size === 1 ? [...sel][0] : null;
    if (selectedId) {
      const m = mounted.get(selectedId);
      if (focus && document.activeElement !== m.frame && !m.frame.contains(document.activeElement)) m.frame.focus({ preventScroll: true });
      if (panelOpenFor() && panelOpenFor() !== 'background' && panelOpenFor() !== selectedId) openSettings();
    } else if (panelOpenFor() && panelOpenFor() !== 'background') closePanel();
    positionSelection();
  }
  // Selecting a grouped widget selects its whole group (single: only this one)
  function select(id, { focus = true, single = false } = {}) {
    const w = id && mounted.has(id) ? findWidget(id) : null;
    if (!w) { setSelection([], { focus }); return; }
    setSelection(single ? [id] : groupOf(w).map((x) => x.id), { focus });
    if (focus && sel.size > 1) mounted.get(id).frame.focus({ preventScroll: true });
  }

  function toView(px, py) {
    const s = stage.getBoundingClientRect(); const v = view.getBoundingClientRect();
    return { x: s.left - v.left + px * scale, y: s.top - v.top + py * scale };
  }
  function positionSelection() {
    const ids = selIds();
    if (!ids.length) { selBox.hidden = true; selAabb.hidden = true; return; }
    const v = view.getBoundingClientRect();
    let box;
    if (ids.length === 1) {
      const m = mounted.get(ids[0]); const w = m.w;
      const c = toView(w.x + w.w / 2, w.y + w.h / 2); const W = w.w * scale; const H = w.h * scale;
      Object.assign(selBox.style, { left: c.x - W / 2 + 'px', top: c.y - H / 2 + 'px', width: W + 'px', height: H + 'px', transform: w.rotation ? `rotate(${w.rotation}deg)` : '' });
      selBox.classList.toggle('is-locked', !!w.locked);
      selBox.classList.remove('is-multi');
      const r = m.frame.getBoundingClientRect();
      box = { l: r.left - v.left, t: r.top - v.top, r: r.right - v.left, b: r.bottom - v.top };
    } else {
      box = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
      for (const id of ids) {
        const r = mounted.get(id).frame.getBoundingClientRect();
        box.l = Math.min(box.l, r.left - v.left); box.t = Math.min(box.t, r.top - v.top); box.r = Math.max(box.r, r.right - v.left); box.b = Math.max(box.b, r.bottom - v.top);
      }
      Object.assign(selBox.style, { left: box.l + 'px', top: box.t + 'px', width: box.r - box.l + 'px', height: box.b - box.t + 'px', transform: '' });
      selBox.classList.add('is-multi'); selBox.classList.remove('is-locked');
      const ws = selWidgets(); const g = ws[0].groupId;
      const grouped = !!g && ws.every((x) => x.groupId === g);
      mCount.textContent = grouped ? `Gruppe (${ids.length})` : `${ids.length} ausgewählt`;
      mGroup.hidden = grouped; mUngroup.hidden = !grouped;
    }
    Object.assign(selAabb.style, { left: box.l + 'px', top: box.t + 'px', width: box.r - box.l + 'px', height: box.b - box.t + 'px' });
    selBox.hidden = false; selAabb.hidden = false;
    toolbar.hidden = ids.length !== 1; mtoolbar.hidden = ids.length === 1;
    const below = box.t < 64;
    toolbar.classList.toggle('below', below); mtoolbar.classList.toggle('below', below);
    selBox.classList.toggle('rot-top', below);
  }

  // ---------- drag (one widget, a group or the whole selection) ----------
  function onFramePointerDown(e, w) {
    if (e.button !== 0) return;
    unlockAudio();
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && !e.target.closest('[contenteditable="true"], input, textarea, select')) {
      e.preventDefault();
      const ids = groupOf(w).map((x) => x.id);
      setSelection(sel.has(w.id) ? selIds().filter((id) => !ids.includes(id)) : [...selIds(), ...ids], { focus: false });
      if (sel.has(w.id)) mounted.get(w.id).frame.focus({ preventScroll: true });
      return;
    }
    const wasMulti = sel.has(w.id) && sel.size > 1;
    if (!sel.has(w.id)) select(w.id, { focus: false });
    if (e.target.closest('[data-nodrag], button, input, select, textarea, a')) return;
    if (w.locked) return;
    e.preventDefault();
    const frame = mounted.get(w.id).frame;
    frame.focus({ preventScroll: true });
    const movers = selWidgets().filter((x) => !x.locked).map((x) => ({ w: x, x: x.x, y: x.y }));
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    frame.setPointerCapture(e.pointerId);
    frame.classList.add('is-dragging');
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / scale; const dy = (ev.clientY - start.y) / scale;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      for (const mv of movers) {
        mv.w.x = Math.round(clamp(mv.x + dx, 60 - mv.w.w, STAGE_W - 60));
        mv.w.y = Math.round(clamp(mv.y + dy, 0, STAGE_H - 40));
        place(mounted.get(mv.w.id).frame, mv.w);
      }
      positionSelection();
    };
    const up = () => {
      frame.removeEventListener('pointermove', move); frame.removeEventListener('pointerup', up); frame.removeEventListener('pointercancel', up);
      frame.classList.remove('is-dragging');
      if (moved) changed();
      else if (wasMulti) select(w.id, { focus: false, single: true }); // second click on a group member: just this one
    };
    frame.addEventListener('pointermove', move); frame.addEventListener('pointerup', up); frame.addEventListener('pointercancel', up);
  }

  // ---------- resize (along the widget's own axes, also when rotated) ----------
  function onResizeDown(e, dir) {
    const m = selectedId && mounted.get(selectedId);
    if (!m || m.w.locked || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const w = m.w; const min = m.def.minSize || { w: 160, h: 120 };
    const rad = (w.rotation || 0) * Math.PI / 180; const cos = Math.cos(rad); const sin = Math.sin(rad);
    const s = { x: e.clientX, y: e.clientY, ww: w.w, wh: w.h, ratio: w.w / w.h, cx: w.x + w.w / 2, cy: w.y + w.h / 2 };
    const target = e.currentTarget; target.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const gx = (ev.clientX - s.x) / scale; const gy = (ev.clientY - s.y) / scale;
      const dx = gx * cos + gy * sin; const dy = -gx * sin + gy * cos; // into the widget's frame
      let nw = s.ww + (dir.includes('e') ? dx : -dx);
      let nh = s.wh + (dir.includes('s') ? dy : -dy);
      if (ev.shiftKey) nh = nw / s.ratio;
      nw = Math.max(min.w, Math.min(STAGE_W, nw)); nh = Math.max(min.h, Math.min(STAGE_H, nh));
      const lx = (dir.includes('e') ? 1 : -1) * (nw - s.ww) / 2; const ly = (dir.includes('s') ? 1 : -1) * (nh - s.wh) / 2;
      const cx = s.cx + lx * cos - ly * sin; const cy = s.cy + lx * sin + ly * cos; // opposite corner stays put
      w.w = Math.round(nw); w.h = Math.round(nh);
      w.x = Math.round(cx - nw / 2); w.y = Math.round(cy - nh / 2);
      place(m.frame, w); positionSelection();
    };
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); changed(); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  }

  // ---------- rotate ----------
  function onRotateDown(e) {
    const m = selectedId && mounted.get(selectedId);
    if (!m || m.w.locked || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const w = m.w; const v = view.getBoundingClientRect();
    const c = toView(w.x + w.w / 2, w.y + w.h / 2); const cx = c.x + v.left; const cy = c.y + v.top;
    const ang = (ev) => Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    const a0 = ang(e); const r0 = w.rotation || 0;
    const target = e.currentTarget; target.setPointerCapture(e.pointerId);
    rotOut.hidden = false;
    const move = (ev) => {
      let r = r0 + ang(ev) - a0;
      if (ev.shiftKey) r = Math.round(r / 15) * 15;
      else { const near = Math.round(r / 90) * 90; if (Math.abs(r - near) < 4) r = near; }
      setRotation(w, r);
      rotOut.textContent = `${w.rotation}°`;
    };
    const up = () => { rotOut.hidden = true; target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); changed(); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  }
  function setRotation(w, r) {
    r = ((Math.round(r) % 360) + 360) % 360; if (r > 180) r -= 360;
    w.rotation = r;
    const m = mounted.get(w.id); if (m) place(m.frame, w);
    positionSelection();
  }
  function rotateBy(ids, d) {
    for (const id of ids) { const w = findWidget(id); if (w && !w.locked) setRotation(w, (w.rotation || 0) + d); }
    changed();
  }

  // ---------- marquee: drag on the empty screen to select several widgets ----------
  stage.addEventListener('pointerdown', (e) => {
    if (e.target !== stage) return;
    unlockAudio(); closeMenu();
    if (e.button !== 0) { select(null); return; }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? selIds() : [];
    const v = view.getBoundingClientRect(); const sx = e.clientX; const sy = e.clientY;
    let moved = false;
    stage.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moved = true;
      const l = Math.min(sx, ev.clientX); const t = Math.min(sy, ev.clientY); const r = Math.max(sx, ev.clientX); const b = Math.max(sy, ev.clientY);
      Object.assign(marquee.style, { left: l - v.left + 'px', top: t - v.top + 'px', width: r - l + 'px', height: b - t + 'px' });
      marquee.hidden = false;
      const hits = new Set(base);
      for (const m of mounted.values()) {
        const fr = m.frame.getBoundingClientRect();
        if (fr.left < r && fr.right > l && fr.top < b && fr.bottom > t) groupOf(m.w).forEach((x) => hits.add(x.id));
      }
      setSelection([...hits], { focus: false });
    };
    const up = () => {
      stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerup', up); stage.removeEventListener('pointercancel', up);
      marquee.hidden = true;
      if (!moved && !additive) select(null);
      else if (sel.size) mounted.get(selIds()[0]).frame.focus({ preventScroll: true });
    };
    stage.addEventListener('pointermove', move); stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  });

  // ---------- several widgets: align, distribute, group, duplicate, remove ----------
  function openAlignMenu() {
    const n = selWidgets().filter((w) => !w.locked).length;
    showMenu(mAlign, [
      { icon: 'align-start-vertical', label: 'Links ausrichten', onClick: () => align('left') },
      { icon: 'align-center-vertical', label: 'Horizontal zentrieren', onClick: () => align('center') },
      { icon: 'align-end-vertical', label: 'Rechts ausrichten', onClick: () => align('right') },
      'sep',
      { icon: 'align-start-horizontal', label: 'Oben ausrichten', onClick: () => align('top') },
      { icon: 'align-center-horizontal', label: 'Vertikal zentrieren', onClick: () => align('middle') },
      { icon: 'align-end-horizontal', label: 'Unten ausrichten', onClick: () => align('bottom') },
      'sep',
      { icon: 'align-horizontal-distribute-center', label: 'Waagrecht gleichmässig verteilen', disabled: n < 3, onClick: () => distribute('x') },
      { icon: 'align-vertical-distribute-center', label: 'Senkrecht gleichmässig verteilen', disabled: n < 3, onClick: () => distribute('y') },
    ], { label: 'Ausrichten' });
  }
  function align(kind) {
    const ws = selWidgets().filter((w) => !w.locked); if (ws.length < 2) return;
    const L = Math.min(...ws.map((w) => w.x)); const R = Math.max(...ws.map((w) => w.x + w.w));
    const T = Math.min(...ws.map((w) => w.y)); const B = Math.max(...ws.map((w) => w.y + w.h));
    for (const w of ws) {
      if (kind === 'left') w.x = L; if (kind === 'right') w.x = R - w.w; if (kind === 'center') w.x = Math.round((L + R) / 2 - w.w / 2);
      if (kind === 'top') w.y = T; if (kind === 'bottom') w.y = B - w.h; if (kind === 'middle') w.y = Math.round((T + B) / 2 - w.h / 2);
      place(mounted.get(w.id).frame, w);
    }
    positionSelection(); changed();
  }
  function distribute(axis) {
    const ws = selWidgets().filter((w) => !w.locked); if (ws.length < 3) return;
    const size = axis === 'x' ? 'w' : 'h';
    ws.sort((a, b) => a[axis] - b[axis]);
    const first = ws[0][axis]; const last = ws[ws.length - 1][axis] + ws[ws.length - 1][size];
    const gap = (last - first - ws.reduce((t, w) => t + w[size], 0)) / (ws.length - 1);
    let pos = first;
    for (const w of ws) { w[axis] = Math.round(pos); pos += w[size] + gap; place(mounted.get(w.id).frame, w); }
    positionSelection(); changed();
  }
  function setGrouped(on) {
    const ws = selWidgets(); if (ws.length < 2) return;
    const gid = on ? store.uid() : null;
    ws.forEach((w) => { w.groupId = gid; });
    positionSelection(); changed();
    toast(on ? `${ws.length} Widgets gruppiert – sie bewegen sich jetzt zusammen. Zweiter Klick wählt ein einzelnes.` : 'Gruppe aufgelöst');
  }
  function cloneForPaste(src, dx, dy, gmap) {
    const c = JSON.parse(JSON.stringify(src));
    Object.assign(c, { id: store.uid(), x: Math.min(src.x + dx, STAGE_W - 100), y: Math.min(src.y + dy, STAGE_H - 100), locked: false });
    if (c.groupId) { if (!gmap.has(c.groupId)) gmap.set(c.groupId, store.uid()); c.groupId = gmap.get(c.groupId); }
    if (c.state && 'endsAt' in c.state) Object.assign(c.state, { endsAt: null, pausedRemainingMs: null, done: false, repeatsLeft: null });
    return c;
  }
  function duplicateSelection() {
    const ws = selWidgets().sort((a, b) => a.z - b.z); if (!ws.length) return;
    const gmap = new Map(); let z = maxZ();
    const copies = ws.map((w) => { const c = cloneForPaste(w, 40, 40, gmap); c.z = ++z; return c; });
    copies.forEach((c) => { screen().widgets.push(c); mountWidget(c); });
    setSelection(copies.map((c) => c.id)); updateBar(); changed();
  }
  function removeSelection() {
    const ws = selWidgets();
    if (ws.length < 2) { if (ws.length) removeWidget(ws[0].id); return; }
    record();
    for (const w of ws) {
      const list = listOf(w); list.splice(list.indexOf(w), 1);
      const m = mounted.get(w.id); if (m) { m.inst.destroy && m.inst.destroy(); m.frame.remove(); }
      mounted.delete(w.id);
    }
    setSelection([]); updateBar(); changed();
    toast(`${ws.length} Widgets entfernt`, { action: 'Rückgängig', onAction: () => undo() });
  }
  function selectAll() { setSelection([...mounted.keys()], { focus: false }); if (sel.size) mounted.get(selIds()[0]).frame.focus({ preventScroll: true }); }

  // ---------- widgets: add, remove, duplicate, layers ----------
  function maxZ() { return allWidgets().reduce((z, w) => Math.max(z, w.z || 0), 0); }

  function addWidget(type, patch) {
    const def = WIDGETS[type];
    const base = def.create();
    if (patch && patch.settings) Object.assign(base.settings, patch.settings);
    const n = screen().widgets.length % 8; // cascade so new widgets never land exactly on top of each other
    const w = {
      id: store.uid(), type, x: Math.round((STAGE_W - def.size.w) / 2 + n * 40), y: Math.round((STAGE_H - def.size.h) / 2 - 80 + n * 40),
      w: def.size.w, h: def.size.h, rotation: 0, z: maxZ() + 1, locked: false, groupId: null, themeId: 'standard', ...base,
    };
    if (patch && patch.size) { w.w = patch.size.w; w.h = patch.size.h; w.x = Math.round((STAGE_W - w.w) / 2 + n * 40); w.y = Math.round((STAGE_H - w.h) / 2 - 60 + n * 40); }
    screen().widgets.push(w);
    mountWidget(w); select(w.id); updateBar(); changed();
    if (def.openSettingsOnAdd && def.openSettingsOnAdd(w)) openSettings();
    return w;
  }

  // ---------- images: paste and drop ----------
  async function addImageFromFile(file) {
    try {
      const rec = await putUpload(file, 'image');
      const url = await getUploadUrl(rec.id);
      const size = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 4, h: 3 }); im.src = url; });
      const k = Math.min(900 / size.w, 640 / size.h, 1.5);
      addWidget('image', { settings: { uploadId: rec.id, alt: (file.name || '').replace(/\.[a-z0-9]+$/i, '') }, size: { w: Math.max(200, Math.round(size.w * k)), h: Math.max(150, Math.round(size.h * k)) } });
    } catch (err) { toast(err.message || 'Bild konnte nicht gespeichert werden.'); }
  }
  const onPaste = (e) => {
    if (isTyping(e)) return;
    const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.kind === 'file' && /^image\//.test(i.type));
    if (item) { e.preventDefault(); addImageFromFile(item.getAsFile()); return; }
    if (widgetClipboard && pasteWidget()) e.preventDefault();
  };
  const onDragOver = (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); view.classList.add('is-dropping'); } };
  const onDragLeave = (e) => { if (e.target === view || !view.contains(e.relatedTarget)) view.classList.remove('is-dropping'); };
  const onDrop = (e) => {
    view.classList.remove('is-dropping');
    const files = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter((f) => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    files.slice(0, 5).forEach((f) => addImageFromFile(f));
  };
  document.addEventListener('paste', onPaste);
  view.addEventListener('dragover', onDragOver); view.addEventListener('dragleave', onDragLeave); view.addEventListener('drop', onDrop);
  cleanups.push(() => document.removeEventListener('paste', onPaste));

  function removeWidget(id) {
    const w = id && findWidget(id);
    if (!w) return;
    const list = listOf(w); const index = list.indexOf(w);
    list.splice(index, 1);
    const m = mounted.get(id); if (m) { m.inst.destroy && m.inst.destroy(); m.frame.remove(); }
    mounted.delete(id);
    select(null); updateBar(); changed();
    const screenId = screen().id;
    toast(`${WIDGETS[w.type].label} entfernt`, { action: 'Rückgängig', onAction: () => {
      const target = list === deck.pinnedWidgets ? list : (deck.screens.find((s) => s.id === screenId) || screen()).widgets;
      target.splice(index, 0, w); changed();
      if (target === screen().widgets || target === deck.pinnedWidgets) { mountWidget(w); select(w.id); updateBar(); }
    } });
  }

  function duplicateWidget(id) {
    const w = findWidget(id); if (!w) return;
    const copy = JSON.parse(JSON.stringify(w));
    Object.assign(copy, { id: store.uid(), x: Math.min(w.x + 40, STAGE_W - 100), y: Math.min(w.y + 40, STAGE_H - 100), z: maxZ() + 1, locked: false });
    if (copy.state && 'endsAt' in copy.state) Object.assign(copy.state, { endsAt: null, pausedRemainingMs: null, done: false, repeatsLeft: null });
    screen().widgets.push(copy); mountWidget(copy); select(copy.id); changed();
  }

  function layer(id, dir) {
    const w = findWidget(id); if (!w) return;
    const zs = allWidgets().map((x) => x.z || 0);
    w.z = dir > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
    place(mounted.get(id).frame, w); changed();
  }

  function toggleLock(id) {
    const m = mounted.get(id); if (!m) return;
    m.w.locked = !m.w.locked; m.inst.update && m.inst.update(); positionSelection(); changed();
    toast(m.w.locked ? 'Widget fixiert' : 'Widget lässt sich wieder verschieben');
  }

  function copyWidget() {
    const ws = selWidgets().sort((a, b) => a.z - b.z); if (!ws.length) return;
    widgetClipboard = JSON.parse(JSON.stringify(ws));
    toast(`${ws.length === 1 ? WIDGETS[ws[0].type].label : ws.length + ' Widgets'} kopiert – mit ${modKey}+V einfügen (auch auf anderen Bildschirmen)`);
  }
  function pasteWidget() {
    const src = (widgetClipboard || []).filter((w) => WIDGETS[w.type]);
    if (!src.length) return false;
    const same = src.some((c) => screen().widgets.some((x) => x.x === c.x && x.y === c.y));
    const gmap = new Map(); let z = maxZ();
    const copies = src.map((c) => { const n = cloneForPaste(c, same ? 40 : 0, same ? 40 : 0, gmap); n.z = ++z; return n; });
    copies.forEach((c) => { screen().widgets.push(c); mountWidget(c); });
    setSelection(copies.map((c) => c.id)); updateBar(); changed();
    widgetClipboard = copies.map((c) => JSON.parse(JSON.stringify(c)));
    return true;
  }
  function togglePin(id) {
    const w = findWidget(id); if (!w) return;
    if (deck.pinnedWidgets.includes(w)) {
      deck.pinnedWidgets.splice(deck.pinnedWidgets.indexOf(w), 1); screen().widgets.push(w);
      toast('Widget nur noch auf diesem Bildschirm');
    } else {
      screen().widgets.splice(screen().widgets.indexOf(w), 1); deck.pinnedWidgets.push(w);
      toast('Widget erscheint jetzt auf allen Bildschirmen dieses Decks');
    }
    changed(); renderScreen(); select(id);
  }

  // ---------- spotlight, blur, chime ----------
  let spot = null;
  function spotlight(id) {
    const m = mounted.get(id); if (!m) return;
    if (spot) endSpotlight();
    select(null); closePanel();
    const w = m.w; const k = Math.min((STAGE_W * 0.86) / w.w, (STAGE_H * 0.82) / w.h);
    m.frame.style.transform = `translate(${STAGE_W / 2 - (w.x + w.w / 2)}px, ${STAGE_H / 2 - (w.y + w.h / 2)}px) scale(${k})`;
    m.frame.classList.add('is-spot');
    spotScrim.hidden = false; view.classList.add('is-spot');
    spot = id;
    api.announce && api.announce('Hervorgehoben');
  }
  function endSpotlight() {
    if (!spot) return;
    const m = mounted.get(spot);
    if (m) { m.frame.classList.remove('is-spot'); place(m.frame, m.w); }
    spotScrim.hidden = true; view.classList.remove('is-spot');
    const id = spot; spot = null;
    if (m) select(id);
  }
  function setBlur(on) {
    blurCover.hidden = !on; view.classList.toggle('is-blurred', on);
    if (on) { select(null); closePanel(); blurCover.querySelector('button').focus(); }
  }
  const api = {};

  // ---------- undo / redo (whole deck snapshots) ----------
  const snapshot = () => JSON.stringify({ screens: deck.screens, pinned: deck.pinnedWidgets });
  const hist = { past: [], future: [], last: snapshot() };
  let histTimer = null;
  function recordSoon() { clearTimeout(histTimer); histTimer = setTimeout(record, 350); }
  function record() {
    clearTimeout(histTimer);
    const cur = snapshot(); if (cur === hist.last) return;
    hist.past.push(hist.last); if (hist.past.length > 60) hist.past.shift();
    hist.last = cur; hist.future = [];
  }
  function restoreSnap(snap) {
    const o = JSON.parse(snap);
    restoring = true;
    deck.screens = o.screens; deck.pinnedWidgets = o.pinned;
    si = Math.min(si, deck.screens.length - 1);
    renderScreen(); changed();
    restoring = false;
  }
  function undo() {
    record();
    if (!hist.past.length) { toast('Nichts zum Rückgängigmachen'); return; }
    hist.future.push(hist.last); hist.last = hist.past.pop(); restoreSnap(hist.last);
  }
  function redo() {
    if (!hist.future.length) { toast('Nichts zum Wiederholen'); return; }
    hist.past.push(hist.last); hist.last = hist.future.pop(); restoreSnap(hist.last);
  }

  function setAspect(r) {
    deck.aspectRatio = r;
    STAGE_W = r === '4:3' ? 1440 : 1920;
    stage.style.width = STAGE_W + 'px';
    for (const w of [...deck.pinnedWidgets, ...deck.screens.flatMap((s) => s.widgets)]) w.x = Math.min(w.x, Math.max(0, STAGE_W - w.w));
    renderScreen(); fit(); changed();
    toast(r === '4:3' ? 'Seitenverhältnis 4:3 (für ältere Beamer)' : 'Seitenverhältnis 16:9');
  }

  function openWidgetMenu() {
    const id = selectedId; const w = findWidget(id); if (!w) return;
    showMenu(tbMore, [
      { icon: 'settings', label: 'Einstellungen', kbd: 'S', onClick: () => openSettings() },
      { icon: 'copy', label: 'Duplizieren', kbd: 'Shift D', onClick: () => duplicateWidget(id) },
      { icon: 'clipboard', label: 'Kopieren', kbd: modKey + ' C', onClick: () => copyWidget() },
      { icon: 'pin', label: deck.pinnedWidgets.includes(w) ? 'Nur auf diesem Bildschirm' : 'Auf allen Bildschirmen zeigen', kbd: 'Shift P', onClick: () => togglePin(id) },
      { icon: 'scan', label: 'Hervorheben', kbd: 'Shift S', onClick: () => spotlight(id) },
      { icon: 'lock', label: w.locked ? 'Nicht mehr fixieren' : 'Fixieren', kbd: 'Shift L', onClick: () => toggleLock(id) },
      { icon: 'rotate-cw', label: 'Um 90° drehen', kbd: 'R', disabled: w.locked, onClick: () => rotateBy([id], 90) },
      w.rotation ? { icon: 'rotate-ccw', label: `Drehung zurücksetzen (${w.rotation}°)`, disabled: w.locked, onClick: () => { setRotation(w, 0); changed(); } } : null,
      { icon: 'layers', label: 'Nach vorne', kbd: modKey + ' ↑', onClick: () => layer(id, 1) },
      { icon: 'layers', label: 'Nach hinten', kbd: modKey + ' ↓', onClick: () => layer(id, -1) },
      'sep',
      { icon: 'trash-2', label: 'Entfernen', kbd: 'Entf', danger: true, onClick: () => removeWidget(id) },
    ], { label: 'Widget-Aktionen' });
  }

  // ---------- settings panels ----------
  function openSettings() {
    const m = selectedId && mounted.get(selectedId);
    if (!m || !m.def.settingsPanel) return;
    openPanel({ key: m.w.id, title: m.def.label, iconName: m.def.icon, returnFocus: m.frame,
      build: (body) => m.def.settingsPanel(body, m.w, m.api) });
  }
  function toggleSettings() {
    if (sel.size > 1) return;
    if (selectedId && panelOpenFor() === selectedId) closePanel(); else if (selectedId) openSettings(); else toggleBackground();
  }

  function toggleBackground() {
    if (panelOpenFor() === 'background') { closePanel(); return; }
    select(null);
    openPanel({ key: 'background', title: 'Hintergrund', iconName: 'image', returnFocus: barButtons.get('background'), build: (body) => {
      const grid = h('div', { class: 'bg-grid', role: 'radiogroup', 'aria-label': 'Hintergrund wählen' });
      for (const bg of BACKGROUNDS) {
        const b = h('button', { class: 'bg-tile', type: 'button', role: 'radio', 'aria-checked': String(sameBackground(bg, screen().background)), title: bg.label,
          onClick: () => {
            screen().background = { type: bg.type, value: bg.value };
            applyBackground();
            body.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            changed();
          } },
        h('span', { class: 'bg-tile__swatch', style: { background: backgroundCss(bg) } }), h('span', null, bg.label));
        grid.append(b);
      }
      body.append(section('Farbe oder Verlauf', grid),
        section(null, h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => {
          deck.screens.forEach((s) => { s.background = JSON.parse(JSON.stringify(screen().background)); });
          changed(); toast('Hintergrund für alle Bildschirme übernommen');
        } }, 'Für alle Bildschirme übernehmen')),
        h('p', { class: 'field__hint' }, 'Tipp: Ein Bild kannst du auch direkt auf den Bildschirm ziehen oder mit ' + modKey + '+V einfügen – es wird dann als Bild-Widget eingefügt.'));
      const mine = h('div', { class: 'bg-grid', role: 'radiogroup', 'aria-label': 'Eigene Bilder' });
      const upBtn = h('button', { class: 'btn btn--secondary', type: 'button', onClick: async () => {
        const file = await pickFile('image/*'); if (!file) return;
        try { const rec = await putUpload(file, 'background'); screen().background = { type: 'upload', value: rec.id }; applyBackground(); changed(); drawMine(); }
        catch (err) { toast(err.message); }
      } }, iconEl('image-plus', { size: 18 }), 'Bild hochladen');
      let drawMine = async function () {
        const ups = await listUploads('background');
        mine.replaceChildren(...await Promise.all(ups.map(async (u) => {
          const url = await getUploadUrl(u.id);
          const pick = h('button', { class: 'bg-tile', type: 'button', role: 'radio', title: u.name, 'aria-checked': String(screen().background.type === 'upload' && screen().background.value === u.id),
            onClick: () => { screen().background = { type: 'upload', value: u.id }; applyBackground(); body.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === pick))); changed(); } },
          h('span', { class: 'bg-tile__swatch', style: { background: `center / cover no-repeat url("${url}")` } }), h('span', null, u.name.replace(/\.[a-z]+$/i, '').slice(0, 18)));
          const del = h('button', { class: 'bg-del iconbtn iconbtn--sm iconbtn--danger', type: 'button', 'aria-label': `Bild ${u.name} löschen`, title: 'Bild löschen', onClick: async () => {
            const used = deck.screens.some((s) => (s.background.type === 'upload' && s.background.value === u.id) || (s.background.type === 'slideshow' && s.background.value.uploadIds.includes(u.id)));
            if (used && !(await confirmDialog({ title: 'Bild löschen?', text: 'Es wird in diesem Deck als Hintergrund verwendet. Andere Decks, die es nutzen, zeigen danach eine graue Fläche.', ok: 'Löschen', danger: true }))) return;
            await deleteUpload(u.id);
            deck.screens.forEach((s) => { if (s.background.type === 'upload' && s.background.value === u.id) s.background = { type: 'color', value: '#E9ECF0' }; });
            deck.screens.forEach((s) => { if (s.background.type === 'slideshow') { s.background.value.uploadIds = s.background.value.uploadIds.filter((x) => x !== u.id); if (!s.background.value.uploadIds.length) s.background = { type: 'color', value: '#E9ECF0' }; } });
            show.ids = show.ids.filter((x) => x !== u.id);
            applyBackground(); changed(); drawMine();
          } }, iconEl('x', { size: 16 }));
          return h('div', { class: 'bg-wrap' }, pick, del);
        })));
        if (!ups.length) mine.append(h('p', { class: 'field__hint', style: { gridColumn: '1 / -1' } }, 'Noch keine eigenen Bilder. Grosse Fotos werden beim Hochladen auf 1920 px verkleinert.'));
      };
      body.prepend(section('Eigenes Bild', upBtn, mine));
      // slideshow from own images
      const cur = screen().background.type === 'slideshow' ? screen().background.value : null;
      const show = { ids: cur ? [...cur.uploadIds] : [], every: cur ? cur.every : 60 };
      const showGrid = h('div', { class: 'bg-grid', role: 'group', 'aria-label': 'Bilder für die Diashow' });
      const every = h('select', { class: 'input', id: 'ss-every', onChange: () => { show.every = Number(every.value); if (screen().background.type === 'slideshow') startShow(); } },
        SLIDE_INTERVALS.map((o) => h('option', { value: String(o.s), selected: o.s === show.every }, o.label)));
      const startBtn = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => startShow() }, iconEl('play', { size: 18 }), 'Diashow starten');
      const showHint = h('p', { class: 'field__hint', role: 'status' });
      function startShow() {
        if (show.ids.length < 2) { toast('Wähle mindestens zwei Bilder für die Diashow.'); return; }
        screen().background = { type: 'slideshow', value: { uploadIds: [...show.ids], every: show.every } };
        applyBackground(); changed();
        body.querySelectorAll('.bg-grid[role=radiogroup] [role=radio]').forEach((x) => x.setAttribute('aria-checked', 'false'));
        paintShow();
      }
      function paintShow() {
        const on = screen().background.type === 'slideshow';
        showHint.textContent = on ? `Diashow läuft: ${screen().background.value.uploadIds.length} Bilder.` : show.ids.length < 2 ? 'Tippe mindestens zwei Bilder an.' : `${show.ids.length} Bilder gewählt.`;
        startBtn.lastChild.textContent = on ? 'Diashow aktualisieren' : 'Diashow starten';
      }
      async function drawShow() {
        const ups = await listUploads('background');
        showGrid.replaceChildren(...await Promise.all(ups.map(async (u) => {
          const url = await getUploadUrl(u.id);
          const b = h('button', { class: 'bg-tile bg-tile--pick', type: 'button', 'aria-pressed': String(show.ids.includes(u.id)), title: u.name, onClick: () => {
            show.ids = show.ids.includes(u.id) ? show.ids.filter((x) => x !== u.id) : [...show.ids, u.id];
            b.setAttribute('aria-pressed', String(show.ids.includes(u.id)));
            const n = b.querySelector('.bg-tile__n'); n.textContent = show.ids.includes(u.id) ? String(show.ids.indexOf(u.id) + 1) : '';
            showGrid.querySelectorAll('.bg-tile--pick').forEach((x) => { const id = x.dataset.id; x.querySelector('.bg-tile__n').textContent = show.ids.includes(id) ? String(show.ids.indexOf(id) + 1) : ''; });
            paintShow();
          } },
          h('span', { class: 'bg-tile__swatch', style: { background: `center / cover no-repeat url("${url}")` } }, h('span', { class: 'bg-tile__n', 'aria-hidden': 'true' }, show.ids.includes(u.id) ? String(show.ids.indexOf(u.id) + 1) : '')),
          h('span', null, u.name.replace(/\.[a-z]+$/i, '').slice(0, 18)));
          b.dataset.id = u.id;
          return b;
        })));
        if (ups.length < 2) showGrid.append(h('p', { class: 'field__hint', style: { gridColumn: '1 / -1' } }, 'Lade oben mindestens zwei eigene Bilder hoch, dann kannst du sie hier als Diashow zeigen.'));
        startBtn.disabled = ups.length < 2;
        paintShow();
      }
      const origDrawMine = drawMine;
      drawMine = async () => { await origDrawMine(); drawShow(); };
      body.append(section('Diashow', h('p', { class: 'field__hint' }, 'Wechselt automatisch zwischen deinen Bildern.'), showGrid,
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'ss-every' }, 'Bild wechseln alle'), every),
        h('div', { class: 'row' }, startBtn), showHint));
      drawMine();
    } });
  }

  // ---------- widget bar ----------
  function barButton(item) {
    const built = isBuilt(item.type);
    const b = h('button', { class: 'wbtn' + (built ? '' : ' wbtn--soon'), type: 'button', 'aria-label': built ? item.label : `${item.label} (in Arbeit)`, title: built ? item.label : `${item.label}: in Arbeit`,
      'aria-disabled': built ? null : 'true',
      onClick: () => {
        unlockAudio();
        if (!built) { toast(`«${item.label}» ist noch in Arbeit.`); return; }
        if (item.type === 'background') toggleBackground(); else addWidget(item.type);
      } },
    iconEl(item.icon, { size: 26 }), h('span', { 'aria-hidden': 'true' }, item.label));
    barButtons.set(item.type, b);
    return b;
  }
  function updateBar() {
    const types = new Set(allWidgets().map((w) => w.type));
    for (const [type, b] of barButtons) {
      if (type === 'background') continue;
      b.classList.toggle('wbtn--active', types.has(type));
      const label = BAR.find((x) => x.type === type).label;
      if (isBuilt(type)) b.setAttribute('aria-label', label + (types.has(type) ? ' (auf dem Bildschirm)' : ''));
    }
  }
  function openMore() {
    showMenu(moreBtn, MORE.map((m) => ({ icon: m.icon, label: m.label + (isBuilt(m.type) ? '' : ' – in Arbeit'), disabled: !isBuilt(m.type), onClick: () => addWidget(m.type) })),
      { label: 'Weitere Widgets', align: 'right' });
  }
  function toggleBar() {
    barHidden = !barHidden;
    bar.hidden = barHidden; showBarBtn.hidden = !barHidden;
    (barHidden ? showBarBtn : hideBarBtn).focus();
  }

  // ---------- screens ----------
  function goTo(i) {
    if (i < 0 || i >= deck.screens.length || i === si) return;
    si = i;
    history.replaceState(null, '', `#/deck/${deck.id}/${si + 1}`);
    store.setLastOpen({ deckId: deck.id, screenIndex: si });
    renderScreen();
  }
  function addScreen() {
    deck.screens.splice(si + 1, 0, store.newScreen(screen().background));
    changed(); goTo(si + 1);
    toast('Neuer Bildschirm angelegt');
  }
  async function deleteScreen() {
    if (deck.screens.length < 2) return;
    const s = screen();
    if (s.widgets.length && !(await confirmDialog({ title: `Bildschirm ${si + 1} löschen?`, text: `Er enthält ${s.widgets.length} Widget${s.widgets.length > 1 ? 's' : ''}.`, ok: 'Löschen', danger: true }))) return;
    const index = si;
    deck.screens.splice(si, 1);
    si = Math.min(si, deck.screens.length - 1);
    history.replaceState(null, '', `#/deck/${deck.id}/${si + 1}`);
    renderScreen(); changed();
    toast('Bildschirm gelöscht', { action: 'Rückgängig', onAction: () => { deck.screens.splice(index, 0, s); si = index; history.replaceState(null, '', `#/deck/${deck.id}/${si + 1}`); renderScreen(); changed(); } });
  }

  // ---------- options, fullscreen, print, shortcuts ----------
  function openOptions() {
    showMenu(optBtn, [
      { icon: 'undo-2', label: 'Rückgängig', kbd: modKey + ' Z', disabled: !hist.past.length && snapshot() === hist.last, onClick: undo },
      { icon: 'redo-2', label: 'Wiederholen', kbd: modKey + ' Y', disabled: !hist.future.length, onClick: redo },
      'sep',
      { icon: 'pencil-line', label: 'Deck umbenennen', onClick: rename },
      { icon: 'plus', label: 'Neuer Bildschirm', kbd: modKey + ' Enter', onClick: addScreen },
      { icon: 'trash-2', label: 'Diesen Bildschirm löschen', disabled: deck.screens.length < 2, danger: true, onClick: deleteScreen },
      'sep',
      { icon: 'bookmark-plus', label: 'Als Vorlage speichern …', onClick: saveAsTemplate },
      { icon: 'layout-template', label: 'Vorlage einfügen …', onClick: () => insertTemplate() },
      'sep',
      { icon: 'download', label: 'Diesen Bildschirm exportieren', onClick: () => doExport('screen') },
      { icon: 'download', label: 'Ganzes Deck exportieren', onClick: () => doExport('deck') },
      { icon: 'upload', label: 'Bildschirme importieren …', onClick: doImport },
      'sep',
      { icon: 'ratio', label: deck.aspectRatio === '4:3' ? 'Seitenverhältnis 16:9 (Standard)' : 'Seitenverhältnis 4:3 (ältere Beamer)', onClick: () => setAspect(deck.aspectRatio === '4:3' ? '16:9' : '4:3') },
      { icon: 'eye-off', label: 'Bildschirm verbergen', kbd: '1', onClick: () => setBlur(true) },
      { icon: 'bell', label: 'Gong', kbd: '2', onClick: () => playSound('gong') },
      { icon: 'printer', label: 'Als PDF drucken (A4 quer)', onClick: () => printScreen() },
      { icon: 'layout-grid', label: 'Tastenkürzel', kbd: 'K', onClick: showShortcuts },
      { icon: 'house', label: 'Zur Übersicht', onClick: () => { location.hash = '#/'; } },
    ], { label: 'Optionen' });
  }
  async function saveAsTemplate() {
    const name = await promptDialog({ title: 'Als Vorlage speichern', label: 'Name der Vorlage', value: screen().name || deck.name, ok: 'Speichern' });
    if (!name) return;
    await saveTemplate(name, screen(), deck.pinnedWidgets);
    toast(`Vorlage «${name}» gespeichert. Du findest sie unter «Vorlagen».`);
  }
  async function insertTemplate() {
    const own = await listTemplates();
    const add = (s) => {
      deck.screens.splice(si + 1, 0, s); changed(); goTo(si + 1);
      toast('Bildschirm aus Vorlage eingefügt');
    };
    showMenu(optBtn, [
      ...own.map((t) => ({ icon: 'layout-template', label: t.name, onClick: () => add(screenFromTemplate(t)) })),
      own.length ? 'sep' : null,
      ...BUILTIN.map((b) => ({ icon: 'layout-grid', label: b.name, onClick: () => add(builtinScreen(b.id)) })),
    ], { label: 'Vorlage einfügen' });
  }
  async function doExport(what) {
    await flush();
    try {
      const r = what === 'screen' ? await exportScreens(deck.id, [screen().id]) : await exportDecks([deck.id]);
      toast(`${what === 'screen' ? 'Bildschirm' : 'Deck'} exportiert (${formatBytes(r.bytes)})`);
    } catch (err) { toast('Export fehlgeschlagen: ' + (err.message || err)); }
  }
  async function doImport() {
    const file = await pickImportFile(); if (!file) return;
    await flush();
    try {
      const r = await importFile(file, { targetDeckId: deck.id, afterIndex: si });
      if (r.kind === 'decks') { toast(`Die Datei enthält ganze Decks: ${r.decks.length} als neue Decks angelegt (siehe Übersicht).`); return; }
      const fresh = await store.getDeck(deck.id);
      deck.screens = fresh.screens; deck.updatedAt = fresh.updatedAt;
      si = r.at; history.replaceState(null, '', `#/deck/${deck.id}/${si + 1}`);
      renderScreen();
      toast(`${r.count} Bildschirm${r.count === 1 ? '' : 'e'} eingefügt`);
    } catch (err) { toast(err.message || 'Import fehlgeschlagen'); }
  }

  async function rename() {
    const name = await promptDialog({ title: 'Deck umbenennen', label: 'Name', value: deck.name });
    if (!name) return;
    deck.name = name; nameEl.textContent = name; document.title = name + ' · Kreidebox'; changed();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => toast('Vollbild ist hier nicht möglich.'));
  }
  function printScreen() { select(null); closePanel(); setTimeout(() => window.print(), 50); }
  function showShortcuts() {
    const rows = [['Widget löschen', 'Entf'], ['Auswahl aufheben', 'Esc'], ['Einstellungen öffnen/schliessen', 'S'], ['Widget duplizieren', 'Shift D'], ['Widget fixieren', 'Shift L'],
      ['An alle Bildschirme heften', 'Shift P'], ['Hervorheben', 'Shift S'], ['Kopieren / Einfügen', modKey + ' C / ' + modKey + ' V'], ['Rückgängig / Wiederholen', modKey + ' Z / ' + modKey + ' Y'],
      ['Bildschirm verbergen', '1'], ['Gong', '2'], ['Zeichnen über allem', 'Stift-Knopf; dann M, H, L, E, Esc'],
      ['Widget verschieben', 'Pfeiltasten (mit Shift: 10 Pixel)'], ['Drehen um 15° (zurück: Shift)', 'R / Shift R'],
      ['Mehrere auswählen', 'Shift-Klick oder Rahmen ziehen'], ['Alles auswählen', modKey + ' A'], ['Gruppieren / auflösen', modKey + ' G / ' + modKey + ' Shift G'], ['Nächster / vorheriger Bildschirm', '→ / ←'], ['Neuer Bildschirm', modKey + ' Enter'], ['Vollbild', 'F'], ['Widget-Leiste ein/aus', 'B'], ['Diese Liste', 'K']];
    const d = h('dialog', { class: 'modal modal--wide', 'aria-labelledby': 'sc-t' },
      h('div', { class: 'modal__body' }, h('h2', { id: 'sc-t' }, 'Tastenkürzel'),
        h('table', { class: 'shortcuts' }, h('tbody', null, rows.map(([a, k]) => h('tr', null, h('td', null, a), h('td', null, h('span', { class: 'kbd' }, k))))))),
      h('div', { class: 'modal__actions' }, h('button', { class: 'btn btn--primary', type: 'button', onClick: () => { d.close(); d.remove(); } }, 'Schliessen')));
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
  }

  // ---------- keyboard ----------
  function onKey(e) {
    if (document.querySelector('dialog[open]')) return;
    if (isTyping(e)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!blurCover.hidden) { e.preventDefault(); setBlur(false); return; }
    if (spot && (e.key === 'Escape' || (e.key === 'S' && e.shiftKey))) { e.preventDefault(); endSpotlight(); return; }
    if (annot.on && !mod) {
      const map = { m: 'pen', h: 'marker', l: 'line', e: 'eraser' };
      if (e.key === 'Escape') { e.preventDefault(); setAnnot(false); return; }
      if (map[e.key.toLowerCase()]) { e.preventDefault(); annot.tool = map[e.key.toLowerCase()]; paintAnnotBar(); return; }
    }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (mod && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) { e.preventDefault(); redo(); return; }
    const m = selectedId && mounted.get(selectedId);
    const many = sel.size > 1;
    if (mod && (m || many) && e.key.toLowerCase() === 'c' && !String(getSelection())) { e.preventDefault(); copyWidget(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
    if (mod && e.key.toLowerCase() === 'g' && many) { e.preventDefault(); setGrouped(!e.shiftKey); return; }
    if (mod && e.key.toLowerCase() === 'g' && m && e.shiftKey && m.w.groupId) { e.preventDefault(); select(selectedId); setGrouped(false); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); addScreen(); return; }
    if (mod && m && e.key === 'ArrowUp') { e.preventDefault(); layer(selectedId, 1); return; }
    if (mod && m && e.key === 'ArrowDown') { e.preventDefault(); layer(selectedId, -1); return; }
    if (mod || e.altKey) return;
    const k = e.key;
    if (many) {
      const ws = selWidgets();
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeSelection(); return; }
      if (k === 'Escape') { e.preventDefault(); select(null); view.focus(); return; }
      if (k === 'D' && e.shiftKey) { e.preventDefault(); duplicateSelection(); return; }
      if (k === 'r' || k === 'R') { e.preventDefault(); rotateBy(selIds(), e.shiftKey ? -15 : 15); return; }
      if (k.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        for (const w of ws) {
          if (w.locked) continue;
          if (k === 'ArrowLeft') w.x -= step; if (k === 'ArrowRight') w.x += step;
          if (k === 'ArrowUp') w.y -= step; if (k === 'ArrowDown') w.y += step;
          place(mounted.get(w.id).frame, w);
        }
        positionSelection(); changed(); return;
      }
    }
    if (m && (k === 'r' || k === 'R') && !m.w.locked) { e.preventDefault(); rotateBy([selectedId], e.shiftKey ? -15 : 15); return; }
    if (m && (k === 'Delete' || k === 'Backspace')) { e.preventDefault(); removeWidget(selectedId); return; }
    if (k === 'Enter' && m && m.inst.edit) { e.preventDefault(); m.inst.edit(); return; }
    if (k === 'Escape') { if (m) { select(null); stage.focus && view.focus(); } return; }
    if (k === 'S' && e.shiftKey) { if (m) { e.preventDefault(); spotlight(selectedId); } return; }
    if (k === 'P' && e.shiftKey && m) { e.preventDefault(); togglePin(selectedId); return; }
    if (k === 's') { e.preventDefault(); toggleSettings(); return; }
    if (k === '1') { e.preventDefault(); setBlur(true); return; }
    if (k === '2') { e.preventDefault(); unlockAudio(); playSound('gong'); return; }
    if (k === 'D' && e.shiftKey && m) { e.preventDefault(); duplicateWidget(selectedId); return; }
    if (k === 'L' && e.shiftKey && m) { e.preventDefault(); toggleLock(selectedId); return; }
    if (k === 'f' || k === 'F') { e.preventDefault(); toggleFullscreen(); return; }
    if (k === 'b' || k === 'B') { e.preventDefault(); toggleBar(); return; }
    if (k === 'k' || k === 'K') { e.preventDefault(); showShortcuts(); return; }
    if (k.startsWith('Arrow')) {
      if (m && !m.w.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (k === 'ArrowLeft') m.w.x -= step; if (k === 'ArrowRight') m.w.x += step;
        if (k === 'ArrowUp') m.w.y -= step; if (k === 'ArrowDown') m.w.y += step;
        place(m.frame, m.w); positionSelection(); changed();
      } else if (!m && (k === 'ArrowRight' || k === 'ArrowLeft')) {
        e.preventDefault(); goTo(si + (k === 'ArrowRight' ? 1 : -1));
      }
    }
  }
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

  // ---------- clock: timers on every screen, tab title, wake lock ----------
  let wakeLock = null;
  async function setWake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { wakeLock = null; }
  }
  const baseTitle = () => deck.name + ' · Kreidebox';
  const clock = setInterval(() => {
    const now = Date.now();
    let anyRunning = false;
    for (const s of deck.screens) {
      for (const w of s.widgets) {
        if (w.type !== 'timer' && w.type !== 'visualtimer') continue;
        if (!mounted.has(w.id) && advance(w, now, { silent: s !== screen() })) changed();
        if (w.state.endsAt) anyRunning = true;
      }
    }
    let title = null;
    for (const m of mounted.values()) {
      if (m.inst.tick) m.inst.tick(now);
      if (!title && m.inst.tabTitle) title = m.inst.tabTitle();
    }
    document.title = title ? `${title} · ${deck.name}` : baseTitle();
    tickSlideshow(now);
    setWake(anyRunning || !!document.fullscreenElement);
  }, 200);
  cleanups.push(() => { clearInterval(clock); setWake(false); });

  // ---------- own colour themes edited or deleted ----------
  const onThemes = () => { for (const m of mounted.values()) m.api.refresh(); };
  addEventListener('nachbau:themes', onThemes);
  cleanups.push(() => removeEventListener('nachbau:themes', onThemes));

  // ---------- other tab changed this deck ----------
  cleanups.push(store.onExternalChange((msg) => {
    if (msg.id === deck.id && msg.updatedAt && msg.updatedAt !== deck.updatedAt) {
      toast('Dieses Deck wurde in einem anderen Fenster geändert.', { action: 'Neu laden', ms: 15000, onAction: () => { flush(); location.reload(); } });
    }
  }));

  renderScreen();
  fit();
  stage.focus && view.setAttribute('tabindex', '-1');

  return async () => {
    closeMenu(); closePanel();
    cleanups.forEach((fn) => fn());
    await flush();
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
