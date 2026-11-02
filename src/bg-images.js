// Mitgelieferte Hintergrundbilder (Wikimedia Commons, Lizenzen in bg/quellen.txt). Dateien liegen in bg/<Thema>/, Vorschauen in bg/thumbs/<Thema>/.
const g = (folder, title, items) => ({ folder, title, items });
export const BG_IMAGES = [
  g('weltall', 'Weltall', [
    ['webb-nebula-1.jpg', 'Tarantelnebel'], ['webb-nebula-2.jpg', 'Orionnebel'], ['hubble-galaxy-1.jpg', 'Spiralgalaxie'], ['hubble-galaxy-2.jpg', 'Galaxie M83'],
    ['earth-from-iss-1.jpg', 'Erde von der ISS'], ['earth-from-iss-2.jpg', 'Erde mit Aschewolke'], ['milky-way-night-sky-1.jpg', 'Milchstrasse 1'], ['milky-way-night-sky-2.jpg', 'Milchstrasse 2'],
    ['moon-full-1.jpg', 'Vollmond'], ['saturn-cassini-1.jpg', 'Saturnringe'], ['saturn-cassini-2.jpg', 'Saturn']]),
  g('raketen', 'Raketen', [
    ['falcon-9-launch-1.jpg', 'Falcon 9 Landung'], ['falcon-9-launch-2.jpg', 'Falcon 9 Start'], ['rocket-launch-night-1.jpg', 'Raketenstart nachts'],
    ['space-shuttle-launch-1.jpg', 'Space Shuttle 1'], ['space-shuttle-launch-2.jpg', 'Space Shuttle 2']]),
  g('tiere', 'Tiere', [
    ['butterfly-flower-1.jpg', 'Tagpfauenauge'], ['owl-1.jpg', 'Uhu'], ['deer-forest-1.jpg', 'Hirsch'], ['penguins-1.jpg', 'Pinguine'],
    ['red-fox-1.jpg', 'Fuchs 1'], ['red-fox-2.jpg', 'Fuchs 2'], ['coral-reef-fish-1.jpg', 'Korallenriff'], ['coral-reef-fish-2.jpg', 'Clownfisch']]),
  g('pflanzen', 'Pflanzen', [
    ['fern-1.jpg', 'Farn'], ['sunflower-field-1.jpg', 'Sonnenblumen'], ['forest-sunlight-1.jpg', 'Buchenwald'], ['forest-sunlight-2.jpg', 'Pappeln'],
    ['autumn-forest-1.jpg', 'Herbstwald'], ['flower-meadow-1.jpg', 'Blumenwiese 1'], ['flower-meadow-2.jpg', 'Blumenwiese 2'], ['green-leaves-1.jpg', 'Eichenblätter']]),
].map((grp) => ({ ...grp, items: grp.items.map(([file, label]) => ({ label, path: `${grp.folder}/${file}` })) }));

export const bgImageUrl = (path) => `bg/${path}`;
export const bgThumbUrl = (path) => `bg/thumbs/${path}`;
// Nur im gehosteten Build vorhanden, nicht in der Einzeldatei zum Doppelklicken (file://).
export const bgImagesAvailable = () => /^https?:$/.test(location.protocol);
