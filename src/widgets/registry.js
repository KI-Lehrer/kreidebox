// Widget contract: { type, label, icon, size, minSize, create(), mount(root, widget, api) -> {update, tick?, destroy?, edit?, tabTitle?},
//                    settingsPanel(body, widget, api), openSettingsOnAdd?(widget) }
// A new widget = one file + one line here.
import timer from './timer.js';
import image from './image.js';
import randomizer from './randomizer.js';
import groupmaker from './groupmaker.js';
import trafficlight from './trafficlight.js';
import worksymbols from './worksymbols.js';
import clock from './clock.js';
import text from './text.js';
import timetable from './timetable.js';
import soundlevel from './soundlevel.js';
import draw from './draw.js';
import visualtimer from './visualtimer.js';
import stopwatch from './stopwatch.js';
import calendar from './calendar.js';
import countdown from './countdown.js';
import poll from './poll.js';
import dice from './dice.js';
import scoreboard from './scoreboard.js';
import stickers from './stickers.js';
import qr from './qr.js';
import { hyperlink, video, embed, pdf, webcam } from './media.js';

export const WIDGETS = { timer, image, randomizer, groupmaker, trafficlight, worksymbols, clock, text, timetable, soundlevel,
  draw, visualtimer, stopwatch, calendar, countdown, poll, dice, scoreboard, stickers, qr, hyperlink, video, embed, pdf, webcam };

// Widget-bar order (as in recon.md). "Mehr" holds the rest.
export const BAR = [
  { type: 'background', label: 'Hintergrund', icon: 'image' },
  { type: 'poll', label: 'Umfrage', icon: 'chart-column' },
  { type: 'randomizer', label: 'Zufall', icon: 'shuffle' },
  { type: 'soundlevel', label: 'Lautstärke', icon: 'audio-lines' },
  { type: 'image', label: 'Bild', icon: 'image-plus' },
  { type: 'text', label: 'Text', icon: 'type' },
  { type: 'worksymbols', label: 'Arbeitsform', icon: 'hand' },
  { type: 'trafficlight', label: 'Ampel', icon: 'traffic-cone' },
  { type: 'timetable', label: 'Tagesplan', icon: 'list-checks' },
  { type: 'timer', label: 'Timer', icon: 'hourglass' },
  { type: 'clock', label: 'Uhr', icon: 'clock' },
];

export const MORE = [
  ['groupmaker', 'Gruppen', 'users'], ['visualtimer', 'Kreis-Timer', 'timer'], ['stopwatch', 'Stoppuhr', 'timer'], ['dice', 'Würfel', 'dice-5'],
  ['scoreboard', 'Punkte', 'chart-column'], ['draw', 'Zeichnen', 'paintbrush-vertical'], ['stickers', 'Sticker', 'palette'], ['qr', 'QR-Code', 'qr-code'],
  ['calendar', 'Kalender', 'calendar'], ['countdown', 'Countdown', 'calendar-days'], ['hyperlink', 'Link', 'globe'], ['video', 'Video', 'video'],
  ['embed', 'Einbetten', 'layout-grid'], ['pdf', 'PDF', 'book-open'], ['webcam', 'Webcam', 'video'],
].map(([type, label, icon]) => ({ type, label, icon }));

export const isBuilt = (type) => type === 'background' || !!WIDGETS[type];
