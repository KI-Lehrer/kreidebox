// Deck <-> KI-Format. Die App schreibt Decks vollständig; Claude und ChatGPT sehen und schreiben das schlanke KI-Format.
const decodeEntities = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const htmlToText = (html) => decodeEntities(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n').replace(/<[^>]*>/g, '')).replace(/\n{2,}/g, '\n').trim();

export function toSpec(data) {
  if (data && data.kreidebox === 1) return data; // von der KI geschrieben, die App hat es noch nicht übernommen
  return {
    kreidebox: 1,
    name: data.name,
    aspect: data.aspectRatio === '4:3' ? '4:3' : '16:9',
    screens: (data.screens || []).map((s) => ({
      name: s.name || '',
      background: s.background && s.background.type === 'color' ? s.background.value : (s.background && s.background.type === 'gradient' ? { type: 'gradient', value: s.background.value } : undefined),
      widgets: (s.widgets || []).map((w) => {
        const o = { id: w.id, type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, theme: w.themeId };
        if (w.settings) { o.settings = { ...w.settings }; delete o.settings.localNames; delete o.settings.absent; delete o.settings.uploadId; }
        if ((w.type === 'timer' || w.type === 'visualtimer') && w.state && w.state.durationMs) { o.minutes = Math.floor(w.state.durationMs / 60000); o.seconds = Math.round((w.state.durationMs % 60000) / 1000); }
        if (w.type === 'text' && w.state) o.text = htmlToText(w.state.html);
        return o;
      }),
    })),
  };
}
