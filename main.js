/* Obsidian Plugin: Parallax Thumbnails v1.3 */
const { Plugin, Modal, Setting, Notice, MarkdownView } = require('obsidian');

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

/** Resolve a vault-relative image path to a browser-usable URI. */
function resolveImgSrc(app, src){
  // Keep explicit URLs
  if (/^(https?:|app:\/\/)/i.test(src)) return src;
  try {
    const af = app.vault.getAbstractFileByPath(src);
    // TFile has 'extension'; TFolder does not
    if (af && Object.prototype.hasOwnProperty.call(af, 'extension')) {
      return app.vault.getResourcePath(af);
    }
  } catch (e) {
    console.warn('[ParallaxThumbs] resolveImgSrc failed for', src, e);
  }
  // Fallback: original string (may still work in some contexts)
  return src;
}

module.exports = class ParallaxThumbsPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: 'insert-parallax-thumb',
      name: 'Insert parallax thumbnail…',
      callback: () => this.openInsertModal()
    });

    this.registerMarkdownCodeBlockProcessor('parallax', (source, el, ctx) => {
      let cfg;
      try { cfg = JSON.parse(source); }
      catch (e) {
        el.createEl('pre', { text: 'parallax: invalid JSON. Provide a JSON config.' });
        return;
      }
      if (!cfg || !Array.isArray(cfg.layers)) {
        el.createEl('pre', { text: 'parallax: missing "layers" array.' });
        return;
      }

      // Initial size/alignment
      const targetW = Number(cfg.width ?? 320);
      const targetH = Number(cfg.height ?? 180);
      const align = String(cfg.align||'left').toLowerCase(); // left|center|right
      const scale = Number(cfg.scale ?? 1);
      const offsetX = Number(cfg.offsetX || 0);
      const offsetY = Number(cfg.offsetY || 0);

      // Controls (outside 3D transform)
      const controls = el.createDiv({ cls: 'parallax-controls' });
      const btnSettings = controls.createEl('button', { text: 'Settings' });
      const btnReset = controls.createEl('button', { text: 'Reset' });
      controls.createDiv({ cls:'hint', text:'Tip: Shift+Drag to move • Drag corner to resize • Double-click viewer to reset' });

      // Stage
      const stage = el.createDiv({ cls: 'parallax-stage ' + (align === 'center' ? 'center' : align === 'right' ? 'right' : 'left') });

      // Resizer (CSS resize:both)
      const resizer = stage.createDiv({ cls: 'parallax-resizer' });
      resizer.style.width = targetW + 'px';
      resizer.style.height = targetH + 'px';

      // Translate wrapper
      const cardWrap = resizer.createDiv({ cls: 'parallax-wrap' });
      cardWrap.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

      // Card
      const card = cardWrap.createDiv({ cls: 'parallax-card' });
      card.style.setProperty('--pt-card-w', targetW + 'px');
      card.style.setProperty('--pt-card-h', targetH + 'px');
      card.setAttr('aria-label', 'Parallax thumbnail');

      // Layers  (patched: resolve src)
      const layers = [];
      for (const L of cfg.layers) {
        const layer = card.createDiv({ cls: 'parallax-layer' });
        layer._depth = Number(L.depth) || 0;
        const img = layer.createEl('img');
        img.src = resolveImgSrc(this.app, String(L.src || ''));   // <-- change
        img.alt = 'parallax-layer';
        layers.push(layer);
      }

      // Optional badge
      if (cfg.badge) {
        const b = card.createDiv({ cls: 'parallax-badge' });
        b.createSpan({ text: cfg.badge });
      }

      const gloss = card.createDiv({ cls: 'parallax-gloss' });
      card.createDiv({ cls: 'parallax-edge' });

      // State
      const state = { rotX: 0, rotY: 0, intensity: cfg.intensity ?? 14, follow: cfg.follow ?? 0.12, scale: scale };
      let raf = null;

      const apply = () => {
        card.style.transform = `scale(${state.scale}) rotateX(${state.rotX}deg) rotateY(${state.rotY}deg)`;
      };

      const parallax = (x, y) => {
        const rect = card.getBoundingClientRect();
        const nx = (x - (rect.left + rect.width / 2)) / (rect.width / 2);
        const ny = (y - (rect.top + rect.height / 2)) / (rect.height / 2);
        const max = state.intensity;
        state.rotY += ((nx * max) - state.rotY) * state.follow;
        state.rotX += ((-ny * max) - state.rotX) * state.follow;
        gloss.style.setProperty('--gx', `${(nx * 35 + 50).toFixed(1)}%`);
        gloss.style.setProperty('--gy', `${(ny * 35 + 50).toFixed(1)}%`);
        for (const layer of layers) {
          const d = layer._depth || 0;
          layer.style.transform = `translateZ(${d * 10}px) translate(${(-nx * d * 4).toFixed(2)}px, ${(ny * d * 4).toFixed(2)}px)`;
        }
      };

      // Pointer tilt
      const onMove = (ev) => {
        const p = ev.touches ? ev.touches[0] : ev;
        parallax(p.clientX, p.clientY);
        if (!raf) raf = requestAnimationFrame(() => { apply(); raf = null; });
      };
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerenter', onMove);
      card.addEventListener('touchmove', onMove, { passive: true });
      card.addEventListener('pointerleave', () => {
        state.rotX = state.rotY = 0; apply();
        gloss.style.setProperty('--gx', `50%`);
        gloss.style.setProperty('--gy', `50%`);
        for (const layer of layers) {
          const d = layer._depth || 0;
          layer.style.transform = `translateZ(${d * 10}px)`;
        }
      });

      // Double-click to reset
      const resetToDefaults = () => {
        state.rotX = state.rotY = 0;
        state.scale = Number(cfg.scale ?? 1);
        // size
        resizer.style.width = (cfg.width ?? 320) + 'px';
        resizer.style.height = (cfg.height ?? 180) + 'px';
        card.style.setProperty('--pt-card-w', (cfg.width ?? 320) + 'px');
        card.style.setProperty('--pt-card-h', (cfg.height ?? 180) + 'px');
        // position and align
        stage.classList.remove('left','center','right');
        stage.classList.add(String(cfg.align||'left'));
        cardWrap.style.transform = `translate(${Number(cfg.offsetX||0)}px, ${Number(cfg.offsetY||0)}px)`;
        apply();
      };
      card.addEventListener('dblclick', () => { resetToDefaults(); new Notice('Parallax reset.'); });

      // Manual dragging for position (Shift+drag)
      let dragging = false, last = null;
      card.addEventListener('pointerdown', (e) => {
        if (!e.shiftKey) return;
        dragging = true; last = {x:e.clientX, y:e.clientY};
        card.ownerDocument.addEventListener('pointermove', dragMove);
        card.ownerDocument.addEventListener('pointerup', dragEnd, { once: true });
      });
      const dragMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        last = {x:e.clientX, y:e.clientY};
        const m = cardWrap.style.transform.match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/);
        let ox = 0, oy = 0;
        if (m) { ox = parseFloat(m[1]); oy = parseFloat(m[2]); }
        ox = clamp(ox + dx, -2000, 2000);
        oy = clamp(oy + dy, -2000, 2000);
        cardWrap.style.transform = `translate(${ox}px, ${oy}px)`;
      };
      const dragEnd = () => { dragging = false; card.ownerDocument.removeEventListener('pointermove', dragMove); };

      // ResizeObserver to sync CSS vars with resizer size
      const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width);
          const h = Math.round(entry.contentRect.height);
          card.style.setProperty('--pt-card-w', w + 'px');
          card.style.setProperty('--pt-card-h', h + 'px');
        }
      });
      ro.observe(resizer);

      // External buttons
      btnReset.addEventListener('click', () => resetToDefaults());
      btnSettings.addEventListener('click', () => {
        const section = ctx.getSectionInfo ? ctx.getSectionInfo(el) : null;
        new SettingsModal(this.app, {
          cfg: Object.assign({}, cfg),
          stage, resizer, cardWrap, card, state,
          onCopyJSON: async (updated) => {
            await navigator.clipboard.writeText(JSON.stringify(updated, null, 2));
            new Notice('Copied updated parallax JSON.');
          },
          onReplaceBlock: (updated) => { tryReplaceBlock(section, ctx, updated); }
        }).open();
      });

      // Initial apply
      apply();
    });
  }

  openInsertModal(){
    const app = this.app;
    const files = app.vault.getFiles().filter(f => /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(f.path));
    if (!files.length){ new Notice('No image files found in this vault.'); return; }

    const modal = new (class extends Modal{
      constructor(app, files, onSubmit){ super(app); this.files=files; this.onSubmit=onSubmit; this.selected = []; }
      onOpen(){
        const {contentEl} = this;
        contentEl.createEl('h2', {text:'Create Parallax Thumbnail'});
        const list = contentEl.createDiv();
        list.style.maxHeight = '240px'; list.style.overflow = 'auto'; list.style.border = '1px solid var(--background-modifier-border)'; list.style.padding='6px'; list.style.borderRadius='8px';

        this.files.forEach((f) => {
          const item = list.createDiv();
          item.style.display='flex'; item.style.alignItems='center'; item.style.gap='8px';
          const cb = item.createEl('input', {type:'checkbox'});
          item.createEl('span', {text:f.path});
          cb.addEventListener('change', () => {
            if (cb.checked) this.selected.push(f); else this.selected = this.selected.filter(x => x!==f);
          });
        });

        new Setting(contentEl).setName('Width (px)').addText(t => { t.setValue('360'); this.w = t; });
        new Setting(contentEl).setName('Height (px)').addText(t => { t.setValue('200'); this.h = t; });
        new Setting(contentEl).setName('Badge (optional)').addText(t => { this.badge = t; });

        new Setting(contentEl).addButton(b => b.setButtonText('Insert').setCta().onClick(()=>{
          if (this.selected.length < 1){ new Notice('Select at least 1 image'); return; }
          const depths = [-2, -1, 1, 2, 3, -3];
          const layers = this.selected.slice(0,6).map((f, i) => ({ depth: depths[i] ?? (i+1), src: f.path }));
          const cfg = {
            width: parseInt(this.w.getValue())||360,
            height: parseInt(this.h.getValue())||200,
            badge: (this.badge?.getValue()||undefined),
            intensity: 16, follow: 0.12, align: 'center',
            layers
          };
          this.onSubmit(cfg); this.close();
        }));
      }
      onClose(){ this.contentEl.empty(); }
    })(app, files, (cfg) => {
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      if (!view){ new Notice('Open a Markdown note to insert.'); return; }
      const block = '```parallax\n' + JSON.stringify(cfg, null, 2) + '\n```\n';
      view.editor.replaceSelection(block);
      new Notice('Inserted parallax block.');
    });

    modal.open();
  }
};

class SettingsModal extends Modal {
  constructor(app, opts){ super(app); this.opts = opts; }
  onOpen(){
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Parallax Settings' });

    const cfg = this.opts.cfg;
    const { state, stage, resizer, cardWrap, card } = this.opts;

    // Scale
    new Setting(contentEl).setName('Scale').addSlider(s => {
      s.setLimits(0.5, 2.0, 0.01).setValue(Number(cfg.scale ?? state.scale ?? 1));
      s.onChange(v => { state.scale = v; card.style.transform = `scale(${state.scale})`; });
    });

    // Offset X/Y
    new Setting(contentEl).setName('Offset X / Y (px)').addSlider(sx => {
      sx.setLimits(-300, 300, 1).setValue(Number(cfg.offsetX || 0));
      sx.onChange(v => { cfg.offsetX = Math.round(v); cardWrap.style.transform = `translate(${cfg.offsetX||0}px, ${cfg.offsetY||0}px)`; });
    }).addSlider(sy => {
      sy.setLimits(-300, 300, 1).setValue(Number(cfg.offsetY || 0));
      sy.onChange(v => { cfg.offsetY = Math.round(v); cardWrap.style.transform = `translate(${cfg.offsetX||0}px, ${cfg.offsetY||0}px)`; });
    });

    // Align
    new Setting(contentEl).setName('Align').addDropdown(d => {
      d.addOptions({ left:'left', center:'center', right:'right' });
      d.setValue(String(cfg.align || 'left'));
      d.onChange(v => {
        stage.classList.remove('left','center','right');
        stage.classList.add(v);
        cfg.align = v;
      });
    });

    // Size sliders reflect resizer (live)
    new Setting(contentEl).setName('Width / Height (px)').addSlider(sw => {
      const curW = Math.round(resizer.clientWidth);
      sw.setLimits(200, 1400, 1).setValue(curW);
      sw.onChange(v => { resizer.style.width = v + 'px'; card.style.setProperty('--pt-card-w', v + 'px'); });
    }).addSlider(sh => {
      const curH = Math.round(resizer.clientHeight);
      sh.setLimits(120, 900, 1).setValue(curH);
      sh.onChange(v => { resizer.style.height = v + 'px'; card.style.setProperty('--pt-card-h', v + 'px'); });
    });

    // Badge text
    new Setting(contentEl).setName('Badge').addText(t => {
      t.setValue(String(cfg.badge || ''));
      t.onChange(v => {
        cfg.badge = v || undefined;
        let badge = card.querySelector('.parallax-badge');
        if (cfg.badge) {
          if (!badge){ badge = card.createDiv({ cls:'parallax-badge' }); badge.createSpan({ text: cfg.badge }); }
          else { badge.empty(); badge.createSpan({ text: cfg.badge }); }
        } else {
          badge?.remove();
        }
      });
    });

    // Buttons
    const row = contentEl.createDiv({ cls:'parallax-controls' });
    const reset = row.createEl('button', { text: 'Reset' });
    const copy  = row.createEl('button', { text: 'Copy updated JSON' });
    const replace = row.createEl('button', { text: 'Replace code block' });

    reset.addEventListener('click', () => {
      state.scale = Number(cfg.scale ?? 1);
      card.style.transform = `scale(${state.scale})`;
      cfg.offsetX = 0; cfg.offsetY = 0; cardWrap.style.transform = `translate(0px, 0px)`;
      cfg.align = 'center'; stage.classList.remove('left','right'); stage.classList.add('center');
      const w = Number(this.opts.cfg.width ?? 320), h = Number(this.opts.cfg.height ?? 180);
      resizer.style.width = w + 'px'; resizer.style.height = h + 'px';
      card.style.setProperty('--pt-card-w', w + 'px'); card.style.setProperty('--pt-card-h', h + 'px');
      new Notice('Reset applied.');
    });

    copy.addEventListener('click', async () => {
      const updated = collectJSON(this.opts);
      await navigator.clipboard.writeText(JSON.stringify(updated, null, 2));
      new Notice('Copied updated JSON.');
    });

    replace.addEventListener('click', () => {
      const updated = collectJSON(this.opts);
      this.opts.onReplaceBlock && this.opts.onReplaceBlock(updated);
    });
  }
  onClose(){ this.contentEl.empty(); }
}

function collectJSON(opts){
  const { cfg, state, stage, resizer, cardWrap } = opts;
  const w = Math.round(resizer.clientWidth);
  const h = Math.round(resizer.clientHeight);
  const m = cardWrap.style.transform.match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/);
  let ox = 0, oy = 0; if (m) { ox = parseFloat(m[1]); oy = parseFloat(m[2]); }
  const align = stage.classList.contains('center') ? 'center' : stage.classList.contains('right') ? 'right' : 'left';
  return Object.assign({}, cfg, { width: w, height: h, scale: state.scale, offsetX: ox, offsetY: oy, align });
}

function tryReplaceBlock(section, ctx, updated){
  try{
    if (!section) { new Notice('Could not locate the original code block in the file.'); return; }
    const app = window.app;
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) { new Notice('Open the note to replace the block.'); return; }
    const filePath = ctx.sourcePath;
    if (!view.file || view.file.path !== filePath) {
      new Notice('Open the source note to replace the block.');
      return;
    }
    const editor = view.editor;
    const from = { line: section.lineStart, ch: 0 };
    const to   = { line: section.lineEnd, ch: 0 };
    const block = '```parallax\n' + JSON.stringify(updated, null, 2) + '\n```\n';
    editor.replaceRange(block, from, to);
    new Notice('Replaced parallax code block.');
  } catch (e){
    console.error(e);
    new Notice('Replace failed (see console).');
  }
}
