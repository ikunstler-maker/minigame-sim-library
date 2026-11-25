import { DEFAULT_PRESET, GRID_COLS, GRID_ROWS, type IconSlot, type Preset } from '../config';
import { slotUrl, type CatalogIcon } from '../ios/iconCatalog';
import { fileToIcon, fileToWallpaper, pickImage } from './images';

type SlotRef = { area: 'grid' | 'dock'; index: number };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Studio editor for the home screen: a phone-shaped grid where icons are dragged
 * to swap places, and tapped to pick an icon, rename, upload or mark as the game.
 */
export class HomeEditor {
  constructor(
    private readonly root: HTMLElement,
    private readonly getPreset: () => Preset,
    private readonly commit: (p: Preset) => void,
    private readonly catalog: CatalogIcon[],
  ) {
    this.render();
  }

  private get(ref: SlotRef): IconSlot | null {
    const p = this.getPreset();
    return (ref.area === 'grid' ? p.home.grid : p.home.dock)[ref.index] ?? null;
  }

  private set(ref: SlotRef, slot: IconSlot | null): void {
    const p = structuredClone(this.getPreset());
    (ref.area === 'grid' ? p.home.grid : p.home.dock)[ref.index] = slot;
    this.commit(p);
    this.render();
  }

  private widgetRows(): Set<number> {
    const w = this.getPreset().weather;
    return w.enabled ? new Set([w.row, w.row + 1]) : new Set();
  }

  render(): void {
    const p = this.getPreset();
    const wr = this.widgetRows();
    const cell = (ref: SlotRef) => {
      const s = this.get(ref);
      const url = s ? slotUrl(s, this.catalog) : '';
      const game = s?.role === 'game' ? ' game' : '';
      const inner = s
        ? `${url ? `<img src="${esc(url)}" draggable="false">` : `<span class="ph">${esc(s.label.slice(0, 1))}</span>`}<em>${esc(s.label)}</em>`
        : '<span class="plus">+</span>';
      return `<div class="cell${s ? '' : ' empty'}${game}" data-area="${ref.area}" data-index="${ref.index}">${inner}</div>`;
    };
    let grid = '';
    for (let r = 0; r < GRID_ROWS; r++) {
      if (wr.has(r)) {
        if (!wr.has(r - 1)) grid += `<div class="widget-block">${esc(p.weather.city)} ${p.weather.temp}°<small>Weather widget</small></div>`;
        continue;
      }
      for (let c = 0; c < GRID_COLS; c++) grid += cell({ area: 'grid', index: r * GRID_COLS + c });
    }
    const dock = [0, 1, 2, 3].map((i) => cell({ area: 'dock', index: i })).join('');
    const wall = p.home.wallpaper;
    this.root.innerHTML = `
      <div class="phone" style="background-image:url('${esc(wall)}')">
        <div class="grid">${grid}</div>
        <div class="dock">${dock}</div>
      </div>
      <p class="note">Drag an icon to move it. Tap a cell to change it. The orange ring marks the icon that opens the game.</p>
      <div class="row">
        <button data-act="wall">Wallpaper…</button>
        <button data-act="wall-default">Default wallpaper</button>
      </div>
      <div class="row"><button data-act="reset-home">Reset home screen</button></div>
    `;
    this.bind();
  }

  private bind(): void {
    this.root.querySelector('[data-act="wall"]')!.addEventListener('click', async () => {
      const f = await pickImage();
      if (!f) return;
      const p = structuredClone(this.getPreset());
      p.home.wallpaper = await fileToWallpaper(f);
      this.commit(p);
      this.render();
    });
    this.root.querySelector('[data-act="wall-default"]')!.addEventListener('click', () => {
      const p = structuredClone(this.getPreset());
      p.home.wallpaper = DEFAULT_PRESET.home.wallpaper;
      this.commit(p);
      this.render();
    });
    this.root.querySelector('[data-act="reset-home"]')!.addEventListener('click', () => {
      if (!confirm('Reset icons and dock to the default layout?')) return;
      const p = structuredClone(this.getPreset());
      p.home.grid = structuredClone(DEFAULT_PRESET.home.grid);
      p.home.dock = structuredClone(DEFAULT_PRESET.home.dock);
      this.commit(p);
      this.render();
    });

    this.root.querySelectorAll<HTMLElement>('.cell').forEach((el) => {
      el.addEventListener('pointerdown', (e) => this.startDrag(e, el));
    });
  }

  private refOf(el: Element | null): SlotRef | null {
    const c = el?.closest<HTMLElement>('.cell');
    if (!c) return null;
    return { area: c.dataset.area as 'grid' | 'dock', index: Number(c.dataset.index) };
  }

  private startDrag(e: PointerEvent, el: HTMLElement): void {
    const from = this.refOf(el)!;
    const hasIcon = !!this.get(from);
    const x0 = e.clientX, y0 = e.clientY;
    let ghost: HTMLElement | null = null;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers cannot be captured */
    }
    const move = (ev: PointerEvent) => {
      if (!hasIcon) return;
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) {
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add('ghost');
        document.body.appendChild(ghost);
        el.classList.add('dragging');
      }
      if (ghost) ghost.style.transform = `translate(${ev.clientX - 28}px, ${ev.clientY - 28}px)`;
    };
    const up = (ev: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (ghost) {
        ghost.remove();
        el.classList.remove('dragging');
        const to = this.refOf(document.elementFromPoint(ev.clientX, ev.clientY));
        if (to && !(to.area === from.area && to.index === from.index)) this.swap(from, to);
      } else {
        this.openSheet(from);
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  private swap(a: SlotRef, b: SlotRef): void {
    const p = structuredClone(this.getPreset());
    const arr = (r: SlotRef) => (r.area === 'grid' ? p.home.grid : p.home.dock);
    const tmp = arr(a)[a.index] ?? null;
    arr(a)[a.index] = arr(b)[b.index] ?? null;
    arr(b)[b.index] = tmp;
    this.commit(p);
    this.render();
  }

  /** Bottom sheet for one slot: pick from the collection, rename, upload, role, remove. */
  private openSheet(ref: SlotRef): void {
    const cur = this.get(ref);
    const draft: IconSlot = cur ? { ...cur } : { iconId: '', label: '', role: 'app' };
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const list = this.catalog
      .map((c) => `<button class="pick${c.id === draft.iconId ? ' on' : ''}" data-id="${c.id}" title="${esc(c.label)}"><img src="${esc(c.url)}" alt=""></button>`)
      .join('');
    sheet.innerHTML = `
      <div class="sheet-body">
        <h3>${ref.area === 'dock' ? 'Dock' : 'Home'} slot ${ref.index + 1}</h3>
        <label>Label <input id="s-label" value="${esc(draft.label)}"></label>
        <label><input id="s-game" type="checkbox" ${draft.role === 'game' ? 'checked' : ''}> Opens the game</label>
        <div class="picks">${list}</div>
        <div class="row">
          <button id="s-upload">Upload PNG…</button>
          <button id="s-remove">Remove</button>
        </div>
        <div class="row"><button id="s-done" class="primary">Done</button></div>
      </div>`;
    document.body.appendChild(sheet);
    const label = sheet.querySelector<HTMLInputElement>('#s-label')!;
    sheet.querySelectorAll<HTMLButtonElement>('.pick').forEach((b) =>
      b.addEventListener('click', () => {
        const c = this.catalog.find((x) => x.id === b.dataset.id)!;
        const wasDefault = !label.value || this.catalog.some((x) => x.label === label.value);
        draft.iconId = c.id;
        delete draft.customSrc;
        if (wasDefault) label.value = c.label;
        if (c.id === 'coin-volcano') sheet.querySelector<HTMLInputElement>('#s-game')!.checked = true;
        sheet.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === b));
      }),
    );
    sheet.querySelector('#s-upload')!.addEventListener('click', async () => {
      const f = await pickImage();
      if (!f) return;
      draft.iconId = 'custom';
      draft.customSrc = await fileToIcon(f);
      sheet.querySelectorAll('.pick').forEach((x) => x.classList.remove('on'));
      sheet.querySelector('#s-upload')!.textContent = 'Uploaded ✓';
    });
    const close = () => sheet.remove();
    sheet.querySelector('#s-remove')!.addEventListener('click', () => {
      close();
      this.set(ref, null);
    });
    sheet.querySelector('#s-done')!.addEventListener('click', () => {
      close();
      if (!draft.iconId) return;
      draft.label = label.value.trim() || draft.label;
      draft.role = sheet.querySelector<HTMLInputElement>('#s-game')!.checked ? 'game' : 'app';
      this.set(ref, draft);
    });
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) close();
    });
  }
}
