/* Options & Chair Adjustment guide: informational only. No dependencies.
 *
 * <options-guide> reads the summary JSON (inline script or one fetch), renders five tabs, and loads the
 * fabrics / arms detail JSON only when needed. It never touches the Hulk option inputs; if anything is
 * missing or fails, the element hides itself and the product page is unchanged.
 */
(function () {
  'use strict';
  if (customElements.get('options-guide')) return;

  /* ---------- helpers ---------- */
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var usd = function (n) { return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var up = function (n) { return !n ? usd(0) : '+' + usd(n); };
  var inch = function (n) { return (Math.round(n * 100) / 100) + '"'; };
  var armRange = function (a) {
    return a.hmin == null ? 'N/A' : (a.hmin === a.hmax ? '~' + inch(a.hmin) : inch(a.hmin) + '–' + inch(a.hmax));
  };
  var sized = function (u, w) { return u ? u + (u.indexOf('?') > -1 ? '&' : '?') + 'width=' + w : ''; };
  var num = function (s) { var m = /([\d,]{4,})/.exec(String(s || '')); return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0; };
  var gname = function (c) {
    var m = /^(L?)G(\d+)$/i.exec(c);
    return m ? (m[1] ? 'Leather Grade ' : 'Grade ') + m[2] : c;
  };
  var DIMS = { Fixed: 'Fixed', '1D': '1D - One Dimensional', '2D': '2D - Two Dimensional', '3D': '3D - Three Dimensional', '4D': '4D - Four Dimensional', '4D+': '4D+ - Four Dimensional Plus' };
  var TABS = [['fabric', 'Fabrics'], ['arms', 'Arms'], ['casters', 'Casters'], ['cylinders', 'Cylinders'], ['mech', 'Chair Adjustment']];
  var SURFACES = ['Carpet', 'Chair mat', 'Wood', 'Tile', 'Linoleum', 'Concrete'];
  var RATE = { E: ['Excellent', 'og-rt-e', '✓'], F: ['Fair', 'og-rt-f', '~'], P: ['Poor', 'og-rt-p', '✕'] };
  var CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#111" stroke-width="1.8" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13"/></svg>';

  function swatch(f, w, cls) {
    cls = cls || '';
    if (f.img) {
      return '<img class="og-sw ' + cls + '" loading="lazy" decoding="async" width="' + (w / 2) + '" height="' + (w / 2) + '" src="' + esc(sized(f.img, w)) + '" alt="">';
    }
    return '<span class="og-sw ' + cls + '" style="background:' + esc(f.hex || '#d9d9d6') + '"></span>';
  }

  function whenIdle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 3000 });
    else setTimeout(fn, 1200);
  }

  /* ---------- the element ---------- */
  class OptionsGuide extends HTMLElement {
    connectedCallback() {
      if (this._started) return;
      this._started = true;
      this.detail = {};
      this.opener = null;
      this.s = {
        tab: this.dataset.defaultTab || 'fabric',
        gSel: null,
        mech: null,
        fab: { grade: 'all', type: 'all', pattern: 'all', fam: 'all', clean: 'all', abr: '0', q: '', sort: 'grade', picked: null, filtersOpen: false },
        open: this.dataset.collapsed !== 'true',
        mechLoaded: {},
        arm: { tier: 'rec', height: 'all', rem: false, memo: false, lock: false }
      };
      var self = this;
      this.start().catch(function () { self.hide(); });
    }

    hide() {
      this.hidden = true;
      var sec = this.closest('.og-section');
      if (sec) sec.hidden = true;
    }

    /* ----- data ----- */
    async start() {
      var data = this.readInline();
      if (!data && this.dataset.summaryUrl) data = await this.getJson(this.dataset.summaryUrl);
      if (!data || (data.v !== 1 && data.v !== 2)) { this.hide(); return; }
      this.summary = data;
      // Shared file that does not list this product (e.g. a stale testing file): show nothing.
      if (data.byHandle && this.dataset.handle && !data.byHandle[this.dataset.handle]) { this.hide(); return; }
      // Shared file: pick this product's own model and seat height.
      var mine = data.byHandle && this.dataset.handle ? data.byHandle[this.dataset.handle] : null;
      if (mine) { data.model = mine.model || data.model; if (mine.seat) data.seat = mine.seat; }
      // Built-in mechanism (no mechanism options): the file lists the set's mechanisms, this product shows only its own.
      var M0 = data.mechanisms;
      if (M0 && M0.choice === false) {
        M0.items = M0.items.filter(function (i) { return mine && i.id === mine.mech; }).map(function (i) {
          return Object.assign({}, i, { sub: ['Standard on the ' + data.model, i.sub].filter(Boolean).join(' · ') });
        });
      }
      // v2: one file per option set, the fabrics and arms lists arrive with the summary.
      if (data.detail) {
        var dt = data.detail;
        ['fabrics', 'arms'].forEach(function (k) {
          if (dt[k]) { this.detail[k + 'Data'] = dt[k]; this.detail[k] = Promise.resolve(dt[k]); }
        }, this);
      }
      if (!data.seat && this.dataset.seat) {
        var sp = this.dataset.seat.split(',').map(Number);
        if (sp.length === 2 && sp[0] > 0 && sp[1] >= sp[0]) data.seat = sp;
      }
      this.tabs = this.availableTabs();
      // Too little to guide: fewer tabs (Chair Adjustment counted) than the section's minimum.
      var minTabs = parseInt(this.dataset.minTabs, 10) || 1;
      if (!this.tabs.length || this.tabs.length < minTabs) { this.hide(); return; }
      if (!this.tabs.some(function (t) { return t[0] === this.s.tab; }, this)) this.s.tab = this.tabs[0][0];
      var F = data.fabrics;
      if (F && F.grades.length) this.s.gSel = F.grades[0].code;
      var M = data.mechanisms;
      if (M && M.items.length) this.s.mech = M.items[0].id;
      this.bind();
      this.render();
      var self = this;
      if (!data.detail && 'IntersectionObserver' in window && F) {
        var io = new IntersectionObserver(function (entries) {
          if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); whenIdle(function () { self.load('fabrics'); }); }
        }, { rootMargin: '400px' });
        io.observe(this);
      }
    }

    readInline() {
      var el = this.querySelector('script[data-og-summary]');
      if (!el) return null;
      try {
        var d = JSON.parse(el.textContent);
        return typeof d === 'string' ? JSON.parse(d) : d;
      } catch (e) { return null; }
    }

    async getJson(url) {
      var r = await fetch(url, { credentials: 'omit' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }

    detailUrl(kind) {
      var u = this.summary.detailUrl && this.summary.detailUrl[kind];
      if (!u) return null;
      var base = this.dataset.filesBase || this.dataset.assetsBase || '';
      return base + u.split('/').pop();
    }

    load(kind) {
      var self = this;
      if (this.detail[kind]) return this.detail[kind];
      var url = this.detailUrl(kind);
      if (!url) return Promise.reject(new Error('no ' + kind));
      this.detail[kind] = this.getJson(url).then(function (d) {
        self.detail[kind + 'Data'] = d;
        if (kind === 'fabrics') { self.renderPanelOnly(); }
        return d;
      }).catch(function (e) { delete self.detail[kind]; throw e; });
      return this.detail[kind];
    }

    availableTabs() {
      var d = this.summary;
      return TABS.filter(function (t) {
        switch (t[0]) {
          case 'fabric': return d.fabrics && d.fabrics.grades && d.fabrics.grades.length;
          case 'arms': return d.arms && d.arms.recommended && d.arms.recommended.length;
          case 'casters': return d.casters && d.casters.length;
          case 'cylinders': return d.cylinders && d.cylinders.length;
          case 'mech': return d.mechanisms && d.mechanisms.items && d.mechanisms.items.length;
        }
        return false;
      });
    }

    /* ----- events ----- */
    bind() {
      var self = this;
      this.addEventListener('click', function (e) {
        var dlg = e.target;
        if (dlg.tagName === 'DIALOG' && dlg.classList.contains('og-dlg')) { dlg.close(); return; }
        var el = e.target.closest('[data-act]');
        if (!el || !self.contains(el)) return;
        self.act(el.dataset.act, el, e);
      });
      var place = function (e) {
        var w = e.target.closest && e.target.closest('.og-zw');
        if (!w) return;
        var pop = w.querySelector('.og-zpop');
        if (!pop) return;
        var r = w.getBoundingClientRect(), vw = document.documentElement.clientWidth, ph = pop.offsetHeight || 200;
        var left = Math.max(8, Math.min(vw - 168, r.left + r.width / 2 - 80));
        var top = r.top - ph - 8 >= 8 ? r.top - ph - 8 : Math.min(r.bottom + 8, window.innerHeight - ph - 8);
        pop.style.left = left + 'px';
        pop.style.top = Math.max(8, top) + 'px';
      };
      this.addEventListener('mouseover', place);
      this.addEventListener('focusin', place);
      this.addEventListener('change', function (e) {
        var el = e.target.closest('[data-bind]');
        if (el) self.setBound(el);
      });
      this.addEventListener('input', function (e) {
        var el = e.target.closest('[data-bind="fab.q"]');
        if (!el) return;
        clearTimeout(self._qt);
        self._qt = setTimeout(function () { self.s.fab.q = el.value; self.updateFab(); }, 150);
      });
    }

    setBound(el) {
      var path = el.dataset.bind.split('.');
      var v = el.type === 'checkbox' ? el.checked : el.value;
      this.s[path[0]][path[1]] = v;
      if (path[0] === 'fab') this.updateFab(); else this.updateArms();
    }

    act(a, el) {
      var s = this.s;
      switch (a) {
        case 'toggle': this.setOpen(!s.open); break;
        case 'mech-load': s.mechLoaded[el.dataset.id] = true; this.renderPanelOnly(); break;
        case 'tab': s.tab = el.dataset.tab; this.renderPanelOnly(true); break;
        case 'grade': s.gSel = el.dataset.g; this.renderPanelOnly(); break;
        case 'mech': s.mech = el.dataset.id; this.renderPanelOnly(); break;
        case 'open-fabrics': this.openFabrics(null, el); break;
        case 'pick-fab': this.openFabrics(el.dataset.code, el); break;
        case 'open-arms': this.openArms(el); break;
        case 'zoom': this.openPhoto(el.dataset.title, el.dataset.src, el); break;
        case 'close': this.closeDialog(el); break;
        case 'fab-pick': s.fab.picked = el.dataset.code; this.updateFab(); break;
        case 'fab-clear': s.fab = Object.assign({}, s.fab, { grade: 'all', type: 'all', pattern: 'all', fam: 'all', clean: 'all', abr: '0', q: '' }); this.fillFabDialog(); break;
        case 'fab-chip': s.fab[el.dataset.key] = el.dataset.key === 'abr' ? '0' : (el.dataset.key === 'q' ? '' : 'all'); this.fillFabDialog(); break;
        case 'ftoggle': s.fab.filtersOpen = !s.fab.filtersOpen; this.fillFabDialog(); break;
        case 'fab-zoom': var f = this.fabByCode(s.fab.picked); if (f) this.openPhoto(f.code + ' ' + f.name + ' · ' + f.pattern, sized(f.img, 900), el); break;
      }
    }

    /* ----- rendering: page ----- */
    render() {
      var s = this.s;
      var tabs = this.tabs.map(function (t) {
        return '<button type="button" role="tab" id="og-t-' + t[0] + '" class="og-tab" aria-selected="' + (s.tab === t[0]) + '" data-act="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('');
      var open = s.open;
      this.innerHTML =
        '<h2 class="og-title"><button type="button" class="og-toggle" data-act="toggle" aria-expanded="' + open + '" aria-controls="og-body"><svg class="og-chev" width="14" height="9" viewBox="0 0 14 9" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 1.5l6 6 6-6"/></svg><span>' + esc((this.dataset.heading || 'Options & Chair Adjustment').replace(/\s+Guide$/i, '') + (this.summary && this.summary.model ? ' for the ' + this.summary.model : '')) + '</span></button></h2>' +
        '<div id="og-body" class="og-body"' + (open ? '' : ' hidden') + '>' +
        '<div class="og-tabs" role="tablist" aria-label="Option types">' + tabs + '</div>' +
        '<div class="og-panel" data-og-panel role="tabpanel"></div></div>';
      this.querySelector('[role=tablist]').addEventListener('keydown', this.tabKeys.bind(this));
      this.renderPanelOnly();
    }

    setOpen(v) {
      this.s.open = !!v;
      var b = this.querySelector('#og-body'), t = this.querySelector('.og-toggle');
      if (b) b.hidden = !v;
      if (t) t.setAttribute('aria-expanded', String(!!v));
      this.classList.toggle('og-closed', !v);
    }

    /* Opens the guide at a tab (and fabric grade). Returns false when this guide cannot show it. */
    goTo(tab, grade) {
      if (!this.tabs || !this.tabs.some(function (t) { return t[0] === tab; })) return false;
      this.setOpen(true);
      this.s.tab = tab;
      if (grade && this.summary.fabrics && this.summary.fabrics.grades.some(function (g) { return g.code === grade; })) this.s.gSel = grade;
      this.renderPanelOnly(true);
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      var b = this.querySelector('#og-t-' + tab);
      if (b) b.focus({ preventScroll: true });
      return true;
    }

    /* A grade link from the option picker: keep the grade list in step and open the explorer filtered to that grade. */
    openGrade(grade, opener, code) {
      if (!this.summary.fabrics || !this.summary.fabrics.grades.some(function (g) { return g.code === grade; })) return false;
      if (this.tabs.some(function (t) { return t[0] === 'fabric'; })) {
        this.s.tab = 'fabric'; this.s.gSel = grade; this.renderPanelOnly(true);
      }
      var fab = code ? (this.detail.fabricsData || { fabrics: [] }).fabrics.filter(function (x) { return x.code === code && x.grade === grade; })[0] : null;
      this.openFabrics(fab ? code : null, opener || this, grade);
      return true;
    }

    tabKeys(e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var ids = this.tabs.map(function (t) { return t[0]; });
      var i = ids.indexOf(this.s.tab) + (e.key === 'ArrowRight' ? 1 : -1);
      this.s.tab = ids[(i + ids.length) % ids.length];
      this.renderPanelOnly(true);
      var b = this.querySelector('#og-t-' + this.s.tab);
      if (b) b.focus();
    }

    renderPanelOnly(updateTabs) {
      var panel = this.querySelector('[data-og-panel]');
      if (!panel) return;
      if (updateTabs) {
        var s = this.s;
        this.querySelectorAll('.og-tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === s.tab)); });
      }
      var html = '';
      switch (this.s.tab) {
        case 'fabric': html = this.fabricPanel(); break;
        case 'arms': html = this.armsPanel(); break;
        case 'casters': html = this.castersPanel(); break;
        case 'cylinders': html = this.cylindersPanel(); break;
        case 'mech': html = this.mechPanel(); break;
      }
      panel.setAttribute('aria-labelledby', 'og-t-' + this.s.tab);
      panel.innerHTML = html;
    }

    /* ----- Fabrics tab ----- */
    patternSpecLine(name) {
      var d = this.detail.fabricsData;
      var p = d && d.patterns && d.patterns[name];
      if (!p) return '';
      return [p.type, p.content, p.abr, p.clean ? 'Cleaning code ' + p.clean : '', p.finish && p.finish !== 'None' ? p.finish : ''].filter(Boolean).join(' · ');
    }

    durText(g) {
      var d = g.durability;
      if (!d) return '—';
      var f = function (n) { return Number(n).toLocaleString('en-US'); };
      return d.minDoubleRubs === d.maxDoubleRubs ? f(d.minDoubleRubs) + ' double rubs' : f(d.minDoubleRubs) + '–' + f(d.maxDoubleRubs) + ' double rubs';
    }

    fabricPanel() {
      /* Some sets (OM5) price the same grade for two parts, e.g. seat and back upholstery. */
      var priceCell = function (g) {
        if (!g.alt || !g.alt.length) return esc(up(g.price));
        return esc((g.part || 'Seat') + ' ' + up(g.price)) + g.alt.map(function (a) { return '<div class="og-muted">' + esc(a.label + ' ' + up(a.price)) + '</div>'; }).join('');
      };
      var self = this, F = this.summary.fabrics, s = this.s, model = this.summary.model;
      var rows = F.grades.map(function (g) {
        var on = g.code === s.gSel;
        return '<tr class="og-row' + (on ? ' og-on' : '') + '" data-act="grade" data-g="' + esc(g.code) + '">' +
          '<td><button type="button" class="og-rowbtn" data-act="grade" data-g="' + esc(g.code) + '" aria-pressed="' + on + '"><span class="og-rdo" aria-hidden="true"></span><span>' + esc(gname(g.code)) + '</span></button></td>' +
          '<td>' + esc(g.materials.join(', ')) + '</td>' +
          '<td class="og-c">' + g.colorCount + '</td><td class="og-nowrap">' + priceCell(g) + '</td></tr>';
      }).join('');

      var items = F.grade_swatches[s.gSel] || [];
      var groups = [], seen = {};
      items.forEach(function (f) {
        if (!seen[f.pattern]) { seen[f.pattern] = []; groups.push([f.pattern, seen[f.pattern]]); }
        seen[f.pattern].push(f);
      });
      var pane = groups.map(function (g) {
        return '<div class="og-phead"><strong>' + esc(g[0]) + '</strong><span>' + esc(((self.detail.fabricsData && self.detail.fabricsData.patterns && self.detail.fabricsData.patterns[g[0]]) || {}).type || '') + '</span></div>' +
          g[1].map(function (f) {
            var label = f.code + ' ' + f.name;
            return '<span class="og-zw"><button type="button" class="og-zbtn" data-act="pick-fab" data-code="' + esc(f.code) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' +
              swatch(f, 112, 'og-sw-s') + '</button><span class="og-zpop" aria-hidden="true">' +
              (f.img ? '<img loading="lazy" src="' + esc(sized(f.img, 320)) + '" alt="">' : '<span class="og-sw" style="background:#d9d9d6;height:160px"></span>') +
              '<span><strong>' + esc(f.code) + '</strong> ' + esc(f.name) + '</span></span></span>';
          }).join('');
      }).join('');

      var gi = F.grades.filter(function (g) { return g.code === s.gSel; })[0] || {};
      return '<div><div class="og-head"><h3>Fabric grades</h3>' +
        '<button type="button" class="og-link" data-act="open-fabrics">Search all ' + F.total + ' fabrics <span aria-hidden="true">→</span></button></div>' +
        '<div class="og-split"><div class="og-scroll"><table class="og-tbl og-tight"><thead><tr><th scope="col">Grade</th><th scope="col">Material type</th><th scope="col" class="og-c">Colors</th><th scope="col">Price</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="og-pane"><div class="og-pane-head"><h3>Patterns</h3></div>' +
        '<div class="og-swatches">' + pane + '</div></div></div></div>';
    }

    /* ----- Arms tab ----- */
    armFeat(a) {
      if (a.feat && a.feat.length) return a.feat;
      var f = [];
      if (a.removable) f.push('Removable');
      if (a.lockable) f.push('Lockable top');
      if (a.memo) f.push('Memosoft padding');
      return f;
    }

    armImg(a, size) {
      size = size || 48;
      var dim = 'style="width:' + size + 'px;height:' + size + 'px" ';
      if (!a.img) return '<span class="og-pic" ' + dim + '></span>';
      var title = a.id;
      return '<span class="og-zw"><button type="button" class="og-zbtn" data-act="zoom" data-title="' + esc(title) + '" data-src="' + esc(sized(a.img, 900)) + '" aria-label="Enlarge photo of ' + esc(a.id) + '">' +
        '<img class="og-pic" ' + dim + 'loading="lazy" decoding="async" width="' + size + '" height="' + size + '" src="' + esc(sized(a.img, size * 2)) + '" alt=""></button>' +
        '<span class="og-zpop" aria-hidden="true"><img loading="lazy" src="' + esc(sized(a.img, 320)) + '" alt=""><span><strong>' + esc(a.id) + '</strong></span></span></span>';
    }

    armsPanel() {
      var self = this, A = this.summary.arms, model = this.summary.model;
      var rows = A.recommended.map(function (a) {
        return '<tr><td><div class="og-cell-flex">' + self.armImg(a) + '<span>' + esc(a.id) + '</span></div></td>' +
          '<td>' + esc(DIMS[a.dim] || a.dim) + '<br><span class="og-muted">' + esc(a.motions) + '</span></td>' +
          '<td class="og-nowrap">' + esc(armRange(a)) + '</td><td>' + esc(self.armFeat(a).join(' · ')) + '</td>' +
          '<td class="og-nowrap">+' + esc(usd(a.price)) + '</td></tr>';
      }).join('');
      return '<div><div class="og-head"><div class="og-head-col"><h3>' + (A.listAll ? 'Arm options' : 'Recommended arms') + '</h3><span class="og-muted">Prices are for a pair · arms are optional</span></div>' +
        (A.total > A.recommended.length ? '<button type="button" class="og-link" data-act="open-arms">View all ' + A.total + ' arm options <span aria-hidden="true">→</span></button>' : '') + '</div>' +
        '<div class="og-scroll"><table class="og-tbl"><thead><tr><th scope="col">Arm</th><th scope="col">Adjustment</th><th scope="col">Arm height range</th><th scope="col">Features</th><th scope="col">Price</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '</div>';
    }

    /* ----- Casters tab ----- */
    castersPanel() {
      var self = this, list = this.summary.casters;
      var SUB = { 'Free rolling': 'Rolls freely', 'Safety brake': 'Brakes when empty, rolls when you sit', 'Reverse brake': 'Rolls when empty, brakes when you sit', 'Glides': 'Fixed feet, stays in place' };
      var hasRatings = list.some(function (c) { return c.floors && c.floors.length === 6; });
      var realFloor = function (c) { return c.floor && !/see caster chart/i.test(c.floor); };
      var hasSuits = hasRatings || list.some(realFloor);
      var hasImgs = list.some(function (c) { return c.img; });
      var head = !hasSuits ? '' : hasRatings ? SURFACES.map(function (n) { return '<th scope="col" class="og-c">' + n + '</th>'; }).join('') : '<th scope="col">Suits</th>';
      var rows = list.map(function (c) {
        var cells = hasRatings ? SURFACES.map(function (n, i) {
          var r = RATE[(c.floors || '').charAt(i)];
          return '<td class="og-c">' + (r ? '<span class="' + r[1] + ' og-rs" role="img" aria-label="' + r[0] + '">' + r[2] + '</span>' : '<span class="og-rt-n">N/A</span>') + '</td>';
        }).join('') : !hasSuits ? '' : '<td>' + esc(realFloor(c) ? c.floor : '–') + '</td>';
        var sub = SUB[c.move] || [c.move, c.note].filter(Boolean).join(' · ');
        return '<tr><td><div class="og-cell-flex og-cell-s">' + (hasImgs ? self.armImg({ id: c.id + ' ' + c.name, img: c.img }, 40) : '') +
          '<span class="og-cas-t"><span>' + (c.name && c.name.indexOf(c.id) === 0 ? '<span>' + esc(c.name) + '</span>' : '<span>' + esc(c.id) + '</span> <span class="og-muted">' + esc(c.name) + '</span>') + (c.std ? ' <span class="og-badge og-dark">Standard</span>' : '') + '</span>' +
          '<span class="og-cas-sub">' + esc(sub) + '</span></span></div></td>' + cells +
          '<td class="og-r og-nowrap">' + esc(up(c.price)) + '</td></tr>';
      }).join('');
      var legend = hasRatings ? '<span class="og-legend"><span class="og-rt-e og-rs" aria-hidden="true">✓</span> Excellent &nbsp; <span class="og-rt-f og-rs" aria-hidden="true">~</span> Fair &nbsp; <span class="og-rt-p og-rs" aria-hidden="true">✕</span> Poor</span>' : '';
      return '<div><div class="og-head"><div class="og-head-col"><h3>Casters</h3>' + (hasSuits ? '<span class="og-muted">Which floors each one suits</span>' : '') + '</div>' + legend + '</div>' +
        '<div class="og-scroll"><table class="og-tbl og-tight og-cas"><thead><tr><th scope="col">Caster</th>' + head + '<th scope="col" class="og-r">Price</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }

    /* ----- Cylinders tab ----- */
    cylindersPanel() {
      var list = this.summary.cylinders, seat = this.summary.seat, model = this.summary.model;
      var std = list.filter(function (c) { return c.std; })[0] || list.filter(function (c) { return !c.price; })[0];
      var ranges = list.map(function (c) { return seat ? [seat[0] + c.off[0], seat[1] + c.off[1]] : null; });
      var lo = 0, hi = 1;
      if (seat) { lo = Math.min.apply(null, ranges.map(function (r) { return r[0]; })) - 1; hi = Math.max.apply(null, ranges.map(function (r) { return r[1]; })) + 1; }
      var delta = function (c) {
        if (!c.off[0] && !c.off[1]) return 'Standard';
        var a = Math.abs(c.off[0]), b = Math.abs(c.off[1]);
        return Math.min(a, b) + '–' + Math.max(a, b) + '" ' + ((c.off[0] + c.off[1]) < 0 ? 'lower' : 'higher');
      };
      var rows = list.map(function (c, i) {
        var r = ranges[i];
        var seatCell = r ? '<td>' + esc(inch(r[0]) + '–' + inch(r[1])) + '</td>' : '';
        return '<tr><td><span class="og-cyl-id">' + esc(c.id) + '</span> <span class="og-muted og-cyl-kind">' + esc(c.kind) + '</span>' + (c.std ? ' <span class="og-badge og-dark">Standard</span>' : '') + '</td>' + seatCell +
          '<td>' + esc(delta(c)) + '</td><td class="og-r">' + esc(up(c.price)) + '</td></tr>';
      }).join('');
      return '<div><div class="og-head"><div class="og-head-col"><h3>Seat height by cylinder</h3><span class="og-muted">' + (seat ? 'Floor to top of seat, approximate. ' : '') + 'HD = heavy duty, rated for heavier use.</span></div></div>' +
        '<div class="og-scroll"><table class="og-tbl"><thead><tr><th scope="col">Cylinder</th>' + (seat ? '<th scope="col">Seat height <span class="og-muted" style="font-weight:400">(approx.)</span></th>' : '') + '<th scope="col">Compared with ' + esc(std ? std.id : 'standard') + '</th><th scope="col" class="og-r">Price</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }

    /* ----- Chair Adjustment tab ----- */
    guideLink(item) {
      var g = item.guide || '';
      if (!g) return '';
      if (/^(https?:)?\/\//.test(g) || g.charAt(0) === '/') return g;
      // a bare image file name is looked up next to the other guide files (Shopify Files base URL, else theme assets)
      if (/\.(png|jpe?g|webp|svg|gif)$/i.test(g)) return (this.dataset.filesBase || this.dataset.assetsBase || '') + g;
      var pat = this.dataset.mechGuideUrl;
      if (!pat || pat === '/pages/{id}') pat = 'https://www.omseating.com/wp-content/themes/omseating/adjustments/{id}.html';
      return pat.replace('{id}', encodeURIComponent(g));
    }

    mechPanel() {
      var self = this, M = this.summary.mechanisms, s = this.s, model = this.summary.model;
      var multi = M.items.length > 1;
      var sel = M.items.filter(function (m) { return m.id === s.mech; })[0] || M.items[0];
      var head = M.controls.map(function (c) { return '<th scope="col" class="og-vh"><span>' + esc(c) + '</span></th>'; }).join('');
      var rows = M.items.map(function (m) {
        var on = m.id === sel.id, mx = M.matrix[m.id] || '';
        var cells = M.controls.map(function (c, i) {
          var yes = mx.charAt(i) === '1';
          return '<td class="og-c"><span class="' + (yes ? 'og-rt-e' : 'og-rt-n') + '" role="img" aria-label="' + (yes ? 'Included' : 'Not included') + '">' + (yes ? '✓' : '–') + '</span></td>';
        }).join('');
        return '<tr class="og-row' + (on ? ' og-on' : '') + '" data-act="mech" data-id="' + esc(m.id) + '"><td><button type="button" class="og-rowbtn" data-act="mech" data-id="' + esc(m.id) + '" aria-pressed="' + on + '">' +
          (multi ? '<span class="og-rdo" aria-hidden="true"></span>' : '') + '<span>' + esc(m.title) + '<br><span class="og-muted">' + esc((m.sub || '').replace(/^(Included|\+\$[\d,.]+)( · )?/, '')) + '</span></span></button></td>' + cells +
          '<td class="og-nowrap">' + (M.choice === false ? 'Included' : esc(up(m.price))) + '</td></tr>';
      }).join('');
      var link = this.guideLink(sel), isImg = /\.(png|jpe?g|webp|svg|gif)(\?|$)/i.test(link);
      var pane;
      if (isImg) {
        pane = '<img class="og-guide-img" loading="lazy" src="' + esc(link) + '" alt="' + esc(sel.title) + ' controls diagram">';
      } else if (!link) {
        pane = '<span class="og-muted">Guide not available yet.</span>';
      } else {
        pane = '<iframe class="og-frame" src="' + esc(link) + '" title="' + esc(sel.title) + ' adjustment guide" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>' ;
      }
      return '<div><div class="og-head"><div class="og-head-col"><h3>Chair adjustment</h3><span class="og-muted">' + (multi ? 'Select a mechanism to see its guide' : 'What the chair’s mechanism lets you adjust') + '</span></div>' + (multi ? '<span class="og-legend"><span class="og-rt-e" aria-hidden="true">✓</span> Included &nbsp; <span class="og-rt-n" aria-hidden="true">–</span> Not included</span>' : '') + '</div>' +
        '<div class="og-mech"><div class="og-scroll">' + ''+
        '<table class="og-tbl og-tight og-mx"><thead><tr><th scope="col">Mechanism</th>' + head + '<th scope="col">Price</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="og-mech-pane"><h3>' + esc(sel.title) + '</h3>' + pane + '</div></div></div>';
    }

    /* ----- dialogs ----- */
    makeDialog(cls, labelId) {
      var dlg = document.createElement('dialog');
      dlg.className = 'og-dlg ' + (cls || '');
      if (labelId) dlg.setAttribute('aria-labelledby', labelId);
      this.appendChild(dlg);
      var self = this;
      dlg.addEventListener('close', function () {
        dlg.remove();
        if (self.opener && document.contains(self.opener)) self.opener.focus();
      });
      return dlg;
    }

    openDlg(dlg, opener) {
      if (opener) this.opener = opener;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }

    closeDialog(el) {
      var d = el.closest('dialog');
      if (d) d.close();
    }

    openPhoto(title, src, opener) {
      var dlg = this.makeDialog('og-zdlg', 'og-z-title');
      dlg.innerHTML = '<div class="og-dlg-in"><div class="og-dlg-head"><strong id="og-z-title">' + esc(title) + '</strong>' +
        '<button type="button" class="og-close" data-act="close" aria-label="Close photo">' + CLOSE_SVG + '</button></div>' +
        '<img src="' + esc(src) + '" alt="' + esc(title) + '"></div>';
      this.openDlg(dlg, opener);
    }

    /* ----- fabrics dialog ----- */
    fabByCode(code) {
      var d = this.detail.fabricsData;
      if (!d) return null;
      return d.fabrics.filter(function (f) { return f.code === code; })[0] || null;
    }

    openFabrics(code, opener, grade) {
      var self = this;
      var f0 = this.s.fab;
      if (code || grade) {
        // From a swatch: start on that fabric's pattern. From a grade link: start on that grade
        // (with the fabric already chosen in the option picker, if any, picked).
        f0.picked = code || null; f0.grade = grade || 'all'; f0.type = 'all'; f0.pattern = 'all'; f0.fam = 'all'; f0.clean = 'all'; f0.abr = '0'; f0.q = '';
        if (grade) f0.filtersOpen = true;
      }
      var dlg = this.makeDialog('', 'og-fm-title');
      this.fabDlg = dlg;
      dlg.innerHTML = '<div class="og-dlg-in"><div class="og-dlg-head"><h2 id="og-fm-title">Explore fabrics</h2>' +
        '<button type="button" class="og-close" data-act="close" aria-label="Close">' + CLOSE_SVG + '</button></div><div class="og-loading" role="status">Loading fabrics…</div></div>';
      this.openDlg(dlg, opener);
      this.load('fabrics').then(function () {
        if (code && !grade) {
          var fb = self.fabByCode(code);
          if (fb) { self.s.fab.pattern = fb.pattern; self.s.fab.filtersOpen = true; }
        }
        if (dlg.isConnected) self.fillFabDialog(true);
      })
        .catch(function () { dlg.querySelector('.og-loading').textContent = 'Fabrics could not be loaded right now. Please try again later.'; });
    }

    gradePrice(code) {
      var g = this.summary.fabrics.grades.filter(function (x) { return x.code === code; })[0];
      return g ? g.price : 0;
    }

    fabFiltered() {
      var d = this.detail.fabricsData, f = this.s.fab, self = this;
      var q = f.q.trim().toLowerCase(), min = parseInt(f.abr, 10) || 0;
      var list = d.fabrics.filter(function (x) {
        var p = d.patterns[x.pattern] || {};
        if (f.grade !== 'all' && x.grade !== f.grade) return false;
        if (f.type !== 'all' && x.type !== f.type) return false;
        if (f.pattern !== 'all' && x.pattern !== f.pattern) return false;
        if (f.fam !== 'all' && x.family !== f.fam) return false;
        if (f.clean !== 'all' && (p.clean || '').split(/[\s,]+/).indexOf(f.clean) < 0) return false;
        if (min && num(p.abr) < min) return false;
        if (q && (x.code + ' ' + x.name + ' ' + x.pattern + ' ' + (x.family || '')).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var idx = {}; d.fabrics.forEach(function (x, i) { idx[x.code] = i; });
      var byPattern = function (a, b) { return a.pattern.localeCompare(b.pattern) || idx[a.code] - idx[b.code]; };
      switch (f.sort) {
        case 'priceAsc': list.sort(function (a, b) { return self.gradePrice(a.grade) - self.gradePrice(b.grade) || idx[a.code] - idx[b.code]; }); break;
        case 'priceDesc': list.sort(function (a, b) { return self.gradePrice(b.grade) - self.gradePrice(a.grade) || idx[a.code] - idx[b.code]; }); break;
        case 'abr': list.sort(function (a, b) { return num((d.patterns[b.pattern] || {}).abr) - num((d.patterns[a.pattern] || {}).abr) || idx[a.code] - idx[b.code]; }); break;
        case 'pattern': list.sort(byPattern); break;
        default: break;
      }
      return list;
    }

    opts(list, cur) {
      return list.map(function (o) {
        var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o;
        return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('');
    }

    fillFabDialog(first) {
      var dlg = this.fabDlg;
      if (!dlg || !dlg.isConnected) return;
      var d = this.detail.fabricsData, f = this.s.fab, F = this.summary.fabrics;
      var types = []; d.fabrics.forEach(function (x) { if (types.indexOf(x.type) < 0) types.push(x.type); });
      var pats = Object.keys(d.patterns).sort();
      var fams = []; d.fabrics.forEach(function (x) { if (x.family && fams.indexOf(x.family) < 0) fams.push(x.family); });
      var sel = function (bind, label, id, html) { return '<div><label class="og-lbl" for="' + id + '">' + label + '</label><select id="' + id + '" class="og-sel" data-bind="' + bind + '">' + html + '</select></div>'; };
      var filters =
        '<div style="display:flex;justify-content:space-between;align-items:baseline;grid-column:1/-1"><p><strong>Filter fabrics</strong></p><button type="button" class="og-linkbtn" data-act="fab-clear">Clear all</button></div>' +
        sel('fab.grade', 'Grade', 'og-fG', '<option value="all">All grades</option>' + this.opts(F.grades.map(function (g) { return [g.code, gname(g.code)]; }), f.grade)) +
        sel('fab.type', 'Material type', 'og-fM', '<option value="all">All materials</option>' + this.opts(types, f.type)) +
        sel('fab.pattern', 'Pattern', 'og-fP', '<option value="all">All patterns</option>' + this.opts(pats, f.pattern)) +
        sel('fab.clean', 'Cleanability', 'og-fK', this.opts([['all', 'Any method'], ['W', 'Water-based OK (W)'], ['BC', 'Bleach-cleanable (BC)']], f.clean)) +
        sel('fab.abr', 'Abrasion / durability', 'og-fA', this.opts([['0', 'Any rating'], ['100000', '100,000+ double rubs'], ['150000', '150,000+ double rubs'], ['200000', '200,000+ double rubs']], f.abr));
      var search = '<div class="og-fm-sr"><div><svg class="og-search-ic" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#5c5c5c" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>' +
        '<input class="og-search" type="search" aria-label="Search fabrics" placeholder="Search pattern, color or code" value="' + esc(f.q) + '" data-bind="fab.q"></div>' +
        '<div><label class="og-lbl" for="og-fSort">Sort by</label><select id="og-fSort" class="og-sel og-fit" data-bind="fab.sort">' +
        this.opts([['grade', 'Grade / collection order'], ['priceAsc', 'Price: low to high'], ['priceDesc', 'Price: high to low'], ['abr', 'Durability: high to low'], ['pattern', 'Pattern name A–Z']], f.sort) + '</select></div></div>';
      dlg.querySelector('.og-dlg-in').innerHTML =
        '<div class="og-dlg-head"><h2 id="og-fm-title">Explore fabrics</h2><button type="button" class="og-close" data-act="close" aria-label="Close">' + CLOSE_SVG + '</button></div>' +
        '<div class="og-dlg-body"><button type="button" class="og-ftoggle" data-act="ftoggle" aria-expanded="' + f.filtersOpen + '"><span>Filters</span><span aria-hidden="true">' + (f.filtersOpen ? '▴' : '▾') + '</span></button>' +
        '<aside class="og-fm-filters' + (f.filtersOpen ? ' og-open' : '') + '" aria-label="Fabric filters">' + filters + '</aside>' +
        '<div class="og-fm-main">' + search + '<div data-og-results></div></div><aside class="og-fm-details" data-og-details aria-label="Fabric details"></aside></div>';
      if (!this.fabByCode(f.picked)) { var l0 = this.fabFiltered(); f.picked = l0.length ? l0[0].code : null; }
      this.updateFab();
      if (first) { var c = dlg.querySelector('.og-close'); if (c) c.focus(); }
    }

    chips() {
      var f = this.s.fab, out = [];
      var lbl = { grade: 'Grade', type: 'Material', pattern: 'Pattern', fam: 'Color', clean: 'Cleanability' };
      Object.keys(lbl).forEach(function (k) { if (f[k] !== 'all') out.push([k, lbl[k] + ': ' + (k === 'grade' ? gname(f[k]) : f[k])]); });
      if (f.abr !== '0') out.push(['abr', Number(f.abr).toLocaleString('en-US') + '+ double rubs']);
      if (f.q.trim()) out.push(['q', '“' + f.q.trim() + '”']);
      return out;
    }

    updateFab() {
      var dlg = this.fabDlg;
      if (!dlg || !dlg.isConnected || !this.detail.fabricsData) return;
      var d = this.detail.fabricsData, f = this.s.fab, F = this.summary.fabrics, self = this;
      var list = this.fabFiltered();
      if (list.length && !list.some(function (x) { return x.code === f.picked; })) f.picked = list[0].code;
      var chips = this.chips().map(function (c) { return '<button type="button" class="og-badge" data-act="fab-chip" data-key="' + c[0] + '" aria-label="Remove filter ' + esc(c[1]) + '">' + esc(c[1]) + ' ×</button>'; }).join(' ');
      var grid = '', last = null;
      list.forEach(function (x) {
        if (x.pattern !== last) {
          last = x.pattern;
          var p = d.patterns[x.pattern] || {};
          grid += '<div class="og-gridhead"><strong>' + esc(x.pattern) + '</strong><span>' + esc([gname(x.grade), p.type || x.type, p.abr].filter(Boolean).join(' · ')) + '</span></div>';
        }
        grid += '<button type="button" class="og-fcard" data-act="fab-pick" data-code="' + esc(x.code) + '" aria-pressed="' + (f.picked === x.code) + '" aria-label="' + esc(x.code + ' ' + x.name + ', ' + x.pattern) + '" title="' + esc(x.code + ' ' + x.name) + '">' +
          swatch(x, 200) + '<span><strong>' + esc(x.code) + '</strong><br>' + esc(x.name) + (x.status === 'phasing out' ? '<br><span class="og-badge">Phasing out</span>' : '') + '</span></button>';
      });
      var res = this.fabDlg.querySelector('[data-og-results]');
      res.innerHTML = '<div class="og-res-head" style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:14px"><p aria-live="polite" class="og-muted">' + list.length + ' of ' + d.fabrics.length + ' fabrics</p>' + chips +
        (chips ? ' <button type="button" class="og-linkbtn" data-act="fab-clear">Clear all</button>' : '') + '</div>' +
        '</div>' + (list.length ? '<div class="og-grid-scroll"><div class="og-grid">' + grid + '</div></div>' : '<p>No fabrics match these filters.</p>');

      var det = this.fabDlg.querySelector('[data-og-details]');
      var v = this.fabByCode(f.picked);
      det.classList.toggle('og-picked', !!v);
      if (!v) { det.innerHTML = '<p class="og-muted">Select a fabric to see its details.</p>'; return; }
      var p = d.patterns[v.pattern] || {};
      var lookups = (this.summary.lookups && this.summary.lookups.cleaning_code) || {};
      var cleanNote = (p.clean || '').split(/[\s,]+/).filter(Boolean).map(function (c) { return lookups[c] ? c + ': ' + lookups[c] : ''; }).filter(Boolean).join('; ');
      var rows = [['Grade', gname(v.grade)], ['Material type', v.type], ['Content', p.content], ['Width', p.width], ['Weight', p.weight], ['Backing', p.backing],
        ['Finish', p.finish], ['Durability', p.abr], ['Cleaning code', p.clean, cleanNote], ['Pattern repeat', p.repeat]].filter(function (r) { return r[1]; });
      det.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><strong>Fabric details</strong></div>' +
        '<div>' + (v.img ? '<button type="button" class="og-zbtn og-zbig" data-act="fab-zoom" aria-label="Enlarge swatch of ' + esc(v.code + ' ' + v.name) + '">' + swatch(v, 640, 'og-sw-wide') + '</button>' : swatch(v, 640, 'og-sw-wide')) + '</div>' +
        '<div><div><strong>' + esc(v.code + ' ' + v.name) + '</strong></div><div class="og-muted">' + esc([v.pattern, gname(v.grade), v.type].join(' · ')) + '</div>' +
        (v.status === 'phasing out' ? '<div><span class="og-badge">Phasing out</span></div>' : '') + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline"><span class="og-muted">Price on ' + esc(this.summary.model) + '</span><strong>' + esc(up(this.gradePrice(v.grade))) + '</strong></div>' +
        '<dl class="og-dl">' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + (r[2] ? '<br><small>' + esc(r[2]) + '</small>' : '') + '</dd>'; }).join('') + '</dl>' +
        (Object.keys(p).length === 0 || !(p.content || p.abr) ? '<p class="og-muted">Detailed specifications for this pattern are not available yet.</p>' : '') +
        '<p class="og-muted">Colors on screen are approximate. Choose this color in the product options above.</p>';
    }

    /* ----- arms dialog ----- */
    openArms(opener) {
      var self = this;
      var dlg = this.makeDialog('', 'og-am-title');
      this.armDlg = dlg;
      dlg.innerHTML = '<div class="og-dlg-in"><div class="og-dlg-head"><div><h2 id="og-am-title">Browse arm options</h2><p class="og-muted">Prices are for a pair of arms added to a ' + esc(this.summary.model) + '. Height ranges are approximate.</p></div>' +
        '<button type="button" class="og-close" data-act="close" aria-label="Close">' + CLOSE_SVG + '</button></div><div class="og-loading" role="status">Loading arms…</div></div>';
      this.openDlg(dlg, opener);
      this.load('arms').then(function () { if (dlg.isConnected) self.fillArmDialog(); })
        .catch(function () { dlg.querySelector('.og-loading').textContent = 'Arms could not be loaded right now. Please try again later.'; });
    }

    fillArmDialog() {
      var d = this.detail.armsData, a = this.s.arm;
      var dims = Object.keys(DIMS).filter(function (k) { return d.arms.some(function (x) { return x.dim === k; }); });
      var adj = [['rec', 'Suggested for ' + this.summary.model], ['all', 'All arms']].concat(dims.map(function (k) { return [k, DIMS[k]]; }));
      this.armDlg.querySelector('.og-dlg-in').innerHTML =
        '<div class="og-dlg-head"><div><h2 id="og-am-title">Browse arm options</h2><p class="og-muted">Prices are for a pair of arms added to a ' + esc(this.summary.model) + '. Height ranges are approximate.</p></div>' +
        '<button type="button" class="og-close" data-act="close" aria-label="Close">' + CLOSE_SVG + '</button></div>' +
        '<div class="og-dlg-bar"><div><label class="og-lbl" for="og-aSel">Adjustment</label><select id="og-aSel" class="og-sel og-fit" data-bind="arm.tier">' + this.opts(adj, a.tier) + '</select></div>' +
        '<div><label class="og-lbl" for="og-aHt">Height group</label><select id="og-aHt" class="og-sel og-fit" data-bind="arm.height">' + this.opts([['all', 'All heights'], ['Low', 'Low'], ['Average', 'Average'], ['Tall', 'Tall']], a.height) + '</select></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px 20px"><label class="og-chk"><input type="checkbox" data-bind="arm.rem"' + (a.rem ? ' checked' : '') + '>Removable</label>' +
        '<label class="og-chk"><input type="checkbox" data-bind="arm.memo"' + (a.memo ? ' checked' : '') + '>Memosoft padding</label>' +
        '<label class="og-chk"><input type="checkbox" data-bind="arm.lock"' + (a.lock ? ' checked' : '') + '>Lockable top</label></div></div>' +
        '<div class="og-dlg-scroll" data-og-arms></div>';
      this.updateArms();
    }

    updateArms() {
      var dlg = this.armDlg;
      if (!dlg || !dlg.isConnected || !this.detail.armsData) return;
      var self = this, d = this.detail.armsData, a = this.s.arm;
      var rec = this.summary.arms.recommended.map(function (x) { return x.id; });
      var list = d.arms.filter(function (x) {
        if (a.tier === 'rec' && rec.indexOf(x.id) < 0) return false;
        if (a.tier !== 'rec' && a.tier !== 'all' && x.dim !== a.tier) return false;
        if (a.height !== 'all' && x.group !== a.height) return false;
        if (a.rem && !x.removable) return false;
        if (a.memo && !x.memo) return false;
        if (a.lock && !x.lockable) return false;
        return true;
      });
      var rows = list.map(function (x) {
        return '<tr><td><div class="og-cell-flex">' + self.armImg(x) + '<span>' + esc(x.id) + (rec.indexOf(x.id) > -1 ? ' <span class="og-badge og-dark">Suggested</span>' : '') + '</span></div></td>' +
          '<td>' + esc(DIMS[x.dim] || x.dim) + '<br><span class="og-muted">' + esc(x.motions) + '</span></td><td>' + esc(x.group || 'N/A') + '</td><td class="og-nowrap">' + esc(armRange(x)) + '</td>' +
          '<td class="og-nowrap">+' + esc(usd(x.price)) + '</td><td>' + esc(self.armFeat(x).join(' · ')) + '</td><td>' + esc(x.warranty || '') + '</td></tr>';
      }).join('');
      dlg.querySelector('[data-og-arms]').innerHTML = '<p aria-live="polite" class="og-muted" style="margin-bottom:10px">' + list.length + ' of ' + d.arms.length + ' arms</p>' +
        (list.length ? '<div class="og-scroll"><table class="og-tbl"><thead><tr><th scope="col">Arm</th><th scope="col">Adjustment</th><th scope="col">Height group</th><th scope="col">Arm height range</th><th scope="col">Price</th><th scope="col">Features</th><th scope="col">Warranty</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p>No arms match these filters.</p>');
    }
  }

  customElements.define('options-guide', OptionsGuide);

  /* The option picker (Hulk) links to the old library pages: one link at the top and one per fabric grade / arms group
     ("...options-library#fab_std_g3", "#arms_sug_pt"). On a page with this guide they open the guide instead.
     One delegated listener, so it works whenever Hulk draws its links and whatever the theme script does to the hrefs.
     Without guide data the links keep working as before. */
  /* The fabric already chosen in the option picker next to this link ("Cover Cloth: 4C00-Jet (Crypton)" -> 4C00). */
  function pickerFabric(a) {
    var box = a.closest ? a.closest('.hulkapps_option') : null;
    if (!box) return null;
    var inp = box.querySelector('input[type="hidden"][name^="properties"]');
    var txt = (inp && inp.value) || '';
    var m = /:\s*([^\s-]+)-/.exec(txt);
    return m ? m[1] : null;
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!a.classList.contains('optionLibraryLink') && !/options-library/i.test(href)) return;
    var guide = document.querySelector('options-guide');
    if (!guide || guide.hidden || !guide.summary || !guide.goTo) return;
    var hash = (/#([^#]+)$/.exec(href) || [])[1] || (a.getAttribute('optionId') || '');
    var m = /^fab_std_(l?g\d+)$/i.exec(hash);
    var tab = m || /^fab_/i.test(hash) ? 'fabric' : /^arms/i.test(hash) ? 'arms' : null;
    var done = m && guide.openGrade ? guide.openGrade(m[1].toUpperCase(), a, pickerFabric(a)) : false;
    if (!done) done = guide.goTo(tab || guide.s.tab, m ? m[1].toUpperCase() : null);
    if (done) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
})();
