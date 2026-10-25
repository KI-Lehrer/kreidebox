// Dashboard (S11): all decks, new deck, rename/duplicate/export/delete, import, backup status, trash.
import * as store from '../data/store.js';
import { exportDecks, exportAll, importFile, pickImportFile } from '../data/transfer.js';
import { h, iconEl, iconButton, relativeTime, formatBytes } from '../ui/dom.js';
import { toast, promptDialog, confirmDialog, showMenu } from '../ui/overlays.js';
import { listFolders, createFolder, renameFolder, deleteFolder, moveDeckToFolder, loadThemes } from '../data/library.js';
import { topNav, themeToggle } from './nav.js';
import { thumbOf } from './templates.js';

const BACKUP_WARN_DAYS = 7;

export async function renderDashboard(root) {
  document.title = 'Meine Bildschirme · Kreidebox';
  const page = h('main', { class: 'dash', id: 'main' });
  root.append(page);
  const unsub = store.onExternalChange(() => draw());
  let filter = 'all'; // 'all' | 'none' | folderId
  await loadThemes();
  await draw();
  return () => unsub();

  async function draw() {
    const [allDecks, status, trash, folders] = await Promise.all([store.listDecks(), store.storageStatus(), store.listTrash(), listFolders()]);
    if (filter !== 'all' && filter !== 'none' && !folders.some((f) => f.id === filter)) filter = 'all';
    for (const d of allDecks) if (d.folderId && !folders.some((f) => f.id === d.folderId)) d.folderId = null;
    const decks = filter === 'all' ? allDecks : allDecks.filter((d) => (filter === 'none' ? !d.folderId : d.folderId === filter));
    const current = folders.find((f) => f.id === filter);
    const title = filter === 'all' ? 'Alle Decks' : filter === 'none' ? 'Ohne Ordner' : current.name;
    page.replaceChildren(...[
      topNav('decks'),
      h('header', { class: 'dash__head' },
        h('div', null, h('h1', null, 'Meine Bildschirme'), h('p', { class: 'dash__sub' }, greeting())),
        h('div', { class: 'dash__actions' },
          themeToggle(),
          h('button', { class: 'btn btn--secondary btn--lg', type: 'button', onClick: doImport }, iconEl('chevron-down', { size: 20 }), 'Importieren'),
          h('button', { class: 'btn btn--primary btn--lg', type: 'button', onClick: newDeck }, iconEl('plus', { size: 20 }), 'Neues Deck'))),
      storageRow(status, allDecks.length),
      allDecks.length || folders.length ? folderBar(folders, allDecks) : null,
      decks.length
        ? h('section', { 'aria-labelledby': 'decks-h' }, h('h2', { id: 'decks-h', class: 'dash__h2' }, `${title} (${decks.length})`),
          h('ul', { class: 'deckgrid', role: 'list' }, decks.map((d) => h('li', null, deckCard(d, folders)))))
        : allDecks.length ? h('div', { class: 'empty empty--small' }, iconEl('folder', { size: 40 }), h('p', null, current ? `Der Ordner «${current.name}» ist leer. Verschiebe Decks über ihr Menü ⋮ hierher.` : 'Alle Decks liegen in Ordnern.'))
        : h('div', { class: 'empty' }, iconEl('layout-grid', { size: 48 }), h('h3', null, 'Hier liegt noch nichts'),
          h('p', null, 'Ein Deck ist eine Folge von Bildschirmen, zum Beispiel für einen Schultag. Lege das erste an.'),
          h('div', { class: 'row', style: { justifyContent: 'center', flexWrap: 'wrap' } },
            h('button', { class: 'btn btn--primary', type: 'button', onClick: newDeck }, iconEl('plus', { size: 18 }), 'Erstes Deck anlegen'),
            h('button', { class: 'btn btn--secondary', type: 'button', onClick: doImport }, 'Sicherung importieren'))),
      trash.length ? trashBox(trash) : null,
      h('footer', { class: 'dash__foot no-print' },
        h('button', { class: 'btn btn--ghost printbtn', type: 'button', onClick: () => window.print() }, iconEl('printer', { size: 16 }), 'Als PDF drucken')),
    ].filter(Boolean));
  }

  function folderBar(folders, all) {
    const count = (id) => all.filter((d) => (id === 'none' ? !d.folderId : d.folderId === id)).length;
    const chip = (id, label, n, icon) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === id), onClick: () => { filter = id; draw(); } },
      iconEl(icon, { size: 16 }), label, h('span', { class: 'chip__n' }, String(n)));
    const bar = h('div', { class: 'folderbar', role: 'group', 'aria-label': 'Ordner' },
      chip('all', 'Alle', all.length, 'layout-grid'),
      ...folders.map((f) => chip(f.id, f.name, count(f.id), 'folder')),
      folders.length ? chip('none', 'Ohne Ordner', count('none'), 'file') : null,
      h('button', { class: 'chip chip--add', type: 'button', onClick: async () => {
        const n = await promptDialog({ title: 'Neuer Ordner', label: 'Name', value: '', placeholder: 'z. B. Mathematik' });
        if (n) { const f = await createFolder(n); filter = f.id; draw(); }
      } }, iconEl('plus', { size: 16 }), 'Ordner'));
    const cur = folders.find((f) => f.id === filter);
    if (cur) {
      const mb = iconButton('ellipsis-vertical', `Optionen für Ordner ${cur.name}`, { cls: 'iconbtn--sm' });
      mb.setAttribute('aria-haspopup', 'menu');
      mb.addEventListener('click', () => showMenu(mb, [
        { icon: 'pencil-line', label: 'Ordner umbenennen', onClick: async () => { const n = await promptDialog({ title: 'Ordner umbenennen', label: 'Name', value: cur.name }); if (n) { await renameFolder(cur.id, n); draw(); } } },
        'sep',
        { icon: 'trash-2', label: 'Ordner löschen', danger: true, onClick: async () => {
          if (await confirmDialog({ title: `Ordner «${cur.name}» löschen?`, text: 'Die Decks darin bleiben erhalten und erscheinen danach unter «Ohne Ordner».', ok: 'Ordner löschen', danger: true })) {
            await deleteFolder(cur.id); filter = 'all'; toast('Ordner gelöscht, Decks sind noch da'); draw();
          }
        } },
      ], { label: `Optionen für Ordner ${cur.name}` }));
      bar.append(mb);
    }
    return bar;
  }

  async function newDeck() {
    const deck = await store.createDeck({ name: 'Neues Deck' });
    if (filter !== 'all' && filter !== 'none') await moveDeckToFolder(deck.id, filter);
    location.hash = `#/deck/${deck.id}/1`;
  }

  async function doImport() {
    const file = await pickImportFile();
    if (!file) return;
    try {
      const r = await importFile(file);
      const extra = [r.images ? `${r.images} Bild${r.images > 1 ? 'er' : ''}` : '', r.lists ? `${r.lists} Namensliste${r.lists > 1 ? 'n' : ''}` : ''].filter(Boolean).join(', ');
      const what = r.kind === 'decks' ? `${r.decks.length} Deck${r.decks.length === 1 ? '' : 's'}` : `${r.count} Bildschirm${r.count === 1 ? '' : 'e'} als neues Deck`;
      toast(`Importiert: ${what}${extra ? ' (' + extra + ')' : ''}`);
      draw();
    } catch (err) { toast(err.message || 'Import fehlgeschlagen'); }
  }

  async function backupAll() {
    try {
      const r = await exportAll();
      toast(`Sicherung gespeichert: ${r.count} Deck${r.count === 1 ? '' : 's'}, ${r.lists} Namensliste${r.lists === 1 ? '' : 'n'} (${formatBytes(r.bytes)}). Lege die Datei z. B. in Google Drive ab.`, { ms: 9000 });
      draw();
    } catch (err) { toast('Sicherung fehlgeschlagen: ' + (err.message || err)); }
  }

  function deckCard(d, folders) {
    const open = `#/deck/${d.id}/1`;
    const menuBtn = iconButton('ellipsis-vertical', `Optionen für ${d.name}`, { cls: 'iconbtn--sm' });
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.addEventListener('click', () => showMenu(menuBtn, [
      { icon: 'play', label: 'Öffnen', onClick: () => { location.hash = open; } },
      { icon: 'pencil-line', label: 'Umbenennen', onClick: async () => { const n = await promptDialog({ title: 'Deck umbenennen', label: 'Name', value: d.name }); if (n) { await store.renameDeck(d.id, n); draw(); } } },
      { icon: 'copy', label: 'Duplizieren', onClick: async () => { await store.duplicateDeck(d.id); toast('Kopie angelegt'); draw(); } },
      { icon: 'folder', label: 'In Ordner verschieben …', onClick: () => moveMenu(menuBtn, d, folders) },
      { icon: 'hard-drive', label: 'Als Datei exportieren', onClick: async () => { const r = await exportDecks([d.id]); toast(`«${d.name}» exportiert (${formatBytes(r.bytes)})`); } },
      'sep',
      { icon: 'trash-2', label: 'Löschen', danger: true, onClick: async () => {
        await store.deleteDeck(d.id); draw();
        toast(`«${d.name}» liegt im Papierkorb`, { action: 'Rückgängig', onAction: async () => { await store.restoreDeck(d.id); draw(); } });
      } },
    ], { label: `Optionen für ${d.name}` }));
    return h('article', { class: 'deck' + (d.archived ? ' deck--archived' : '') },
      h('a', { class: 'deck__link', href: open, 'aria-label': `${d.name} öffnen` }, thumbOf(d.preview)),
      h('div', { class: 'deck__meta' },
        h('div', null, h('div', { class: 'deck__name' }, h('a', { href: open }, d.name)),
          h('div', { class: 'deck__time' }, `${d.screenCount} Bildschirm${d.screenCount === 1 ? '' : 'e'} · ${relativeTime(d.updatedAt)}`)),
        menuBtn));
  }

  function moveMenu(anchor, d, folders) {
    const items = folders.map((f) => ({ icon: f.id === d.folderId ? 'check' : 'folder', label: f.name, onClick: async () => { await moveDeckToFolder(d.id, f.id); toast(`«${d.name}» → ${f.name}`); draw(); } }));
    if (d.folderId) items.push({ icon: 'x', label: 'Aus Ordner entfernen', onClick: async () => { await moveDeckToFolder(d.id, null); draw(); } });
    if (items.length) items.push('sep');
    items.push({ icon: 'plus', label: 'Neuer Ordner …', onClick: async () => {
      const n = await promptDialog({ title: 'Neuer Ordner', label: 'Name', value: '' });
      if (n) { const f = await createFolder(n); await moveDeckToFolder(d.id, f.id); toast(`«${d.name}» → ${f.name}`); draw(); }
    } });
    setTimeout(() => showMenu(anchor, items, { label: `${d.name} verschieben` }), 0);
  }

  function storageRow(s, deckCount) {
    const ageDays = s.lastBackupAt ? (Date.now() - Date.parse(s.lastBackupAt)) / 864e5 : Infinity;
    const stale = deckCount > 0 && (ageDays > BACKUP_WARN_DAYS || !s.persisted);
    const row = h('div', { class: 'storage' + (stale ? ' storage--stale' : '') },
      h('span', { class: 'storage__item' }, iconEl('hard-drive'),
        h('span', null, h('strong', null, 'Gespeichert auf diesem Computer'), s.usage != null ? ` · ${formatBytes(s.usage)}` : '')),
      h('span', { class: 'storage__item' }, iconEl(ageDays <= BACKUP_WARN_DAYS ? 'check' : 'triangle-alert'),
        h('span', null, 'Letzte Sicherung: ', h('strong', null, s.lastBackupAt ? relativeTime(s.lastBackupAt) : 'noch keine'))),
      h('button', { class: 'btn btn--sm ' + (stale ? 'btn--primary' : 'btn--secondary'), type: 'button', onClick: backupAll, disabled: deckCount === 0 }, 'Alles sichern'));
    if (!s.persisted && deckCount > 0) {
      row.append(h('span', { class: 'storage__item storage__note' }, iconEl('info'),
        h('span', null, 'Dieser Browser darf die Daten bei Platzmangel löschen. Sichere regelmässig als Datei, z. B. in Google Drive.')));
    }
    return row;
  }

  function trashBox(trash) {
    return h('details', { class: 'trash' },
      h('summary', null, iconEl('trash-2', { size: 18 }), `Papierkorb (${trash.length})`),
      h('p', { class: 'field__hint' }, 'Gelöschte Decks bleiben 30 Tage hier.'),
      h('ul', { role: 'list' }, trash.map((d) => h('li', { class: 'trash__row' },
        h('span', null, h('strong', null, d.name), ` · gelöscht ${relativeTime(d.deletedAt)}`),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: async () => { await store.restoreDeck(d.id); toast(`«${d.name}» wiederhergestellt`); draw(); } }, 'Wiederherstellen')))));
  }
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 11 ? 'Guten Morgen!' : hr < 14 ? 'Guten Tag!' : hr < 18 ? 'Schönen Nachmittag!' : 'Guten Abend!';
}
