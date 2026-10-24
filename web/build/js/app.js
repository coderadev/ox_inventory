(function () {
    'use strict';

    var CONFIG = {
        layout: {
            pockets: [1, 15],
            backpack: [16, 35],
            body: [36, 40],
            accessories: [41, 45]
        },
        bodyIcons: ['badge', 'smartphone', 'key', 'wallet', 'backpack'],
        accIcons: ['headphones', 'domino_mask', 'eyeglasses', 'security', 'styler'],
        equipAllow: {
        },
        hotbarSlots: 5,
        filters: {
            boxName: { names: ['box', 'crate', 'scrapmetal', 'steel', 'iron', 'copper', 'plastic', 'rubber', 'glass', 'aluminium'] },
            weaponsName: { prefix: ['weapon_', 'ammo-', 'ammo_'] },
            settingsName: { names: ['lockpick', 'advancedlockpick', 'repairkit', 'advancedrepairkit', 'screwdriver', 'radio', 'cleaningkit', 'tunerchip'] },
            foodsName: { names: ['burger', 'water', 'sandwich', 'cola', 'coffee', 'bread', 'donut'], useStatus: true },
            clothesName: { names: ['mask', 'tshirt', 'jacket', 'pants', 'shoes', 'hat', 'glasses'] }
        },
        groundLabel: 'Ground',
        quality: { high: 'rgb(0 248 185)', mid: 'rgb(230, 126, 34)', low: 'rgb(192, 57, 43)' }
    };

    var RES = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'ox_inventory';
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

    function post(name, data) {
        return fetch('https://' + RES + '/' + name, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(data === undefined ? {} : data)
        }).then(function (r) { return r.json(); }).catch(function () { return null; });
    }

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html !== undefined) e.innerHTML = html;
        return e;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function fmtWeight(g) {
        g = Number(g) || 0;
        return g >= 1000 ? (g / 1000).toFixed(1) + 'KG' : g.toFixed(0) + 'G';
    }
    function kg(g) { return ((Number(g) || 0) / 1000).toFixed(1); }

    function hasItem(i) { return i && i.name !== undefined && i.weight !== undefined; }

    function metaEqual(a, b) {
        return JSON.stringify(a || {}) === JSON.stringify(b || {});
    }

    var S = {
        open: false,
        left: { id: '', type: 'player', slots: 0, maxWeight: 0, items: [] },
        right: { id: '', type: '', slots: 0, maxWeight: 0, items: [] },
        itemData: {},
        locale: {},
        imagepath: 'nui://ox_inventory/web/images',
        extraMeta: [],
        shift: false,
        ctrl: false,
        busy: false,
        filter: '',
        search: '',
        inVehicle: false,
        fullStash: false
    };

    var tr = function (k, d) { return S.locale[k] || d; };

    function getItemData(name) {
        var d = S.itemData[name];
        if (d === undefined && name) {
            S.itemData[name] = null;
            post('getItemData', name).then(function (res) {
                if (res && res.name) { S.itemData[name] = res; if (S.open) renderAll(); }
            });
        }
        return d;
    }

    function itemImage(item) {
        if (!item || !item.name) return '';
        var m = item.metadata;
        if (m && m.imageurl) return m.imageurl;
        if (m && m.image) return S.imagepath + '/' + m.image + '.png';
        var d = S.itemData[item.name];
        if (d && d.image) return d.image;
        return S.imagepath + '/' + item.name + '.png';
    }

    function itemLabel(item) {
        if (!item || !item.name) return '';
        if (item.metadata && item.metadata.label) return item.metadata.label;
        var d = S.itemData[item.name];
        return (d && d.label) || item.name;
    }

    function durability(metadata, now) {
        if (!metadata || metadata.durability === undefined) return undefined;
        var d = metadata.durability;
        if (d > 100 && metadata.degrade) d = (metadata.durability - now) / (60 * metadata.degrade) * 100;
        if (d < 0) d = 0;
        return d;
    }

    function prepareInventory(inv) {
        var now = Math.floor(Date.now() / 1000);
        var src = inv.items || [];
        var map = {};
        Object.keys(src).forEach(function (k) {
            var it = src[k];
            if (it && it.slot) map[it.slot] = it;
        });
        var out = [];
        for (var i = 1; i <= inv.slots; i++) {
            var it = map[i] || { slot: i };
            if (it.name) {
                getItemData(it.name);
                it.durability = durability(it.metadata, now);
            }
            out.push(it);
        }
        inv.items = out;
        return inv;
    }

    function invBySide(side) { return side === 'left' ? S.left : S.right; }

    function isShopLike(inv) { return inv.type === 'shop' || inv.type === 'crafting'; }

    var L = CONFIG.layout;
    function inRange(slot, r) { return slot >= r[0] && slot <= r[1]; }
    function sectionOf(slot) {
        if (inRange(slot, L.pockets)) return 'pockets';
        if (inRange(slot, L.backpack)) return 'backpack';
        if (inRange(slot, L.body)) return 'body';
        if (inRange(slot, L.accessories)) return 'accessories';
        return null;
    }
    function isEquipSlot(slot) { var s = sectionOf(slot); return s === 'body' || s === 'accessories'; }

    function equipIcon(slot) {
        if (inRange(slot, L.body)) return CONFIG.bodyIcons[slot - L.body[0]];
        if (inRange(slot, L.accessories)) return CONFIG.accIcons[slot - L.accessories[0]];
    }

    // Rules come from data/equipslots.lua: exact names, or a trailing * for a prefix match.
    function ruleMatch(list, name) {
        name = String(name || '').toLowerCase();
        for (var i = 0; i < list.length; i++) {
            var r = String(list[i]).toLowerCase();
            if (r.slice(-1) === '*' ? name.indexOf(r.slice(0, -1)) === 0 : name === r) return true;
        }
        return false;
    }

    function slotAllows(slot, name) {
        var a = CONFIG.equipAllow[slot];
        return !a || !a.length || ruleMatch(a, name);
    }

    function qualityColor(q) {
        if (q < 25) return CONFIG.quality.low;
        if (q < 50) return CONFIG.quality.mid;
        return CONFIG.quality.high;
    }

    function canUse(item, inv) {
        if (!hasItem(item) && !(item && item.name !== undefined && item.count !== undefined)) return true;
        if (inv.type === 'shop') {
            if (item.count !== undefined && item.count === 0) return false;
            if (item.grade !== undefined && inv.groups) {
                var g = S.left.groups;
                if (!g) return false;
                var keys = Object.keys(inv.groups);
                if (Array.isArray(item.grade)) {
                    for (var i = 0; i < keys.length; i++) {
                        var pg = g[keys[i]];
                        if (pg !== undefined && item.grade.indexOf(pg) !== -1) return true;
                    }
                    return false;
                }
                for (var j = 0; j < keys.length; j++) {
                    if (g[keys[j]] !== undefined && g[keys[j]] >= item.grade) return true;
                }
                return false;
            }
        }
        if (inv.type === 'crafting' && item.ingredients) {
            var ok = true;
            Object.keys(item.ingredients).forEach(function (name) {
                var need = item.ingredients[name];
                if (need >= 1) {
                    var have = 0;
                    S.left.items.forEach(function (i) { if (i.name === name) have += i.count || 0; });
                    if (have < need) ok = false;
                } else {
                    var found = S.left.items.some(function (i) { return i.name === name; });
                    if (!found) ok = false;
                }
            });
            return ok;
        }
        return true;
    }

    function buildSlot(side, slot, extraClass) {
        var e = el('div', 'item-slot' + (extraClass ? ' ' + extraClass : ''));
        e.setAttribute('data-slot', slot);
        e.dataset.side = side;
        return e;
    }

    function fillSlot(e, side, item) {
        var inv = invBySide(side);
        var slot = Number(e.dataset.slot);
        var html = '';

        e.classList.toggle('item-drag', hasItem(item) || !!(item && item.name));
        e.classList.toggle('item-nodrag', !(item && item.name));

        if (side === 'left' && slot <= CONFIG.hotbarSlots) {
            html += '<div class="item-slot-key"><p>' + slot + '</p></div>';
        }
        if (side === 'left' && isEquipSlot(slot) && !(item && item.name)) {
            var ic = equipIcon(slot);
            if (ic) html += '<span style="color:#f3f4f61a" class="material-symbols-outlined emptyicon">' + ic + '</span>';
        }

        if (item && item.name) {
            var img = itemImage(item);
            html += '<div class="item-slot-img"><img src="' + esc(img) + '" alt="' + esc(item.name) + '" draggable="false" /></div>';
            var amount = '';
            if (item.price !== undefined && inv.type === 'shop') {
                var cur = item.currency;
                amount = (tr('$', '$')) + Number(item.price).toLocaleString('en-us');
                if (cur && cur !== 'money') amount = Number(item.price).toLocaleString('en-us') + ' ' + esc(cur);
            } else if (item.count > 0) {
                amount = Number(item.count).toLocaleString('en-us') + ' (' + kg(item.weight) + ')';
            }
            html += '<div class="item-slot-amount"><p>' + amount + '</p></div>';
            if (item.durability !== undefined) {
                var q = Math.max(0, Math.min(100, item.durability));
                html += '<div class="item-slot-quality"><div class="item-slot-quality-bar" style="width:' + q + '%;background-color:' + qualityColor(q) + '"><p>' + Math.round(q) + '</p></div></div>';
            }
            html += '<div class="item-slot-label"><p>' + esc(itemLabel(item)) + '</p></div>';
            e.style.filter = canUse(item, inv) ? '' : 'brightness(80%) grayscale(100%)';
        } else {
            html += '<div class="item-slot-img"></div><div class="item-slot-label"><p>&nbsp;</p></div>';
            e.style.filter = '';
        }
        e.innerHTML = html;
    }

    function clearSlots(container) {
        $$('.item-slot', container).forEach(function (s) { s.remove(); });
    }

    function renderPlayerSide() {
        var pockets = $('.player-inventory .pockets-grid');
        var backpack = $('.player-inventory .ox-carry .alt-inventory');
        var body = $('.player-inventory .body-grid');
        var acc = $('.player-inventory .acc-grid');
        [pockets, backpack, body, acc].forEach(clearSlots);
        S.left.items.forEach(function (item, idx) {
            var slot = idx + 1;
            var sec = sectionOf(slot);
            if (!sec) return;
            var target = sec === 'pockets' ? pockets : sec === 'backpack' ? backpack : sec === 'body' ? body : acc;
            var e = buildSlot('left', slot, '');
            fillSlot(e, 'left', item);
            target.appendChild(e);
        });
    }

    function renderOtherSide() {
        var first = $('.other-inventory .first-inventory');
        var alt = $('.other-inventory > .alt-inventory');
        var altalt = $('.other-inventory > .alt-alt-inventory');
        [first, alt, altalt].forEach(clearSlots);
        var split = S.right.type === 'player';
        $('.oth-inv-container').style.overflow = split ? 'hidden scroll' : 'hidden';
        alt.style.display = split ? 'flex' : 'none';
        altalt.style.display = split ? 'flex' : 'none';
        $$('.ox-sub-header.scroll', $('.other-inventory')).forEach(function (h) { h.style.display = split ? 'flex' : 'none'; });
        S.right.items.forEach(function (item, idx) {
            var slot = idx + 1;
            var target = first;
            if (split) {
                var sec = sectionOf(slot);
                if (!sec) return;
                target = sec === 'pockets' ? first : sec === 'backpack' ? alt : altalt;
            }
            var e = buildSlot('right', slot, '');
            if (split && isEquipSlot(slot)) {
                var ic = equipIcon(slot);
                item = item || { slot: slot };
            }
            fillSlot(e, 'right', item);
            target.appendChild(e);
        });
    }

    function sumWeight(items, from, to) {
        var w = 0;
        items.forEach(function (i, idx) {
            var s = idx + 1;
            if (i && i.name && (from === undefined || (s >= from && s <= to))) w += i.weight || 0;
        });
        return w;
    }

    function renderWeights() {
        var total = sumWeight(S.left.items);
        var pk = $('#player-inv-weight-value');
        if (pk) pk.textContent = kg(total) + '/' + kg(S.left.maxWeight);
        var bp = $('#player-inv-weight-value2');
        if (bp) bp.textContent = kg(sumWeight(S.left.items, L.backpack[0], L.backpack[1]));
        var bd = $('#player-inv-weight-value3');
        if (bd) bd.textContent = kg(sumWeight(S.left.items, L.body[0], L.accessories[1]));

        var lab = $('#other-inv-label');
        var type = S.right.type;
        var label = S.right.label || '';
        if (type === 'newdrop' || type === 'drop') label = CONFIG.groundLabel;
        lab.textContent = label;
        var ow = $('#other-inv-weight-value');
        var show = !isShopLike(S.right);
        $$('.ox-other .ox-weight').forEach(function (w) { w.style.display = show ? '' : 'none'; });
        if (ow && show) ow.textContent = kg(sumWeight(S.right.items)) + '/' + kg(S.right.maxWeight);
    }

    function renderAll() {
        renderPlayerSide();
        renderOtherSide();
        renderWeights();
        applyFilter();
    }

    function refreshSlotEl(side, slot) {
        var inv = invBySide(side);
        var cont = side === 'left' ? $('.player-inventory') : $('.other-inventory');
        var e = $('.item-slot[data-slot="' + slot + '"]', cont);
        if (e) fillSlot(e, side, inv.items[slot - 1]);
    }

    var FILTER_ORDER = ['', 'boxName', 'weaponsName', 'settingsName', 'foodsName', 'clothesName'];

    function matchesFilter(item, type) {
        var f = CONFIG.filters[type];
        if (!f) return true;
        var name = String(item.name || '').toLowerCase();
        var label = itemLabel(item).toLowerCase();
        if (f.prefix && f.prefix.some(function (p) { return name.indexOf(p) === 0; })) return true;
        if (f.names && f.names.some(function (n) { n = n.toLowerCase(); return name === n || name.indexOf(n) !== -1 || label.indexOf(n) !== -1; })) return true;
        if (f.useStatus) {
            var d = S.itemData[item.name];
            if (d && d.client && (d.client.status || d.client.anim === 'eating' || d.client.anim === 'drinking')) return true;
        }
        return false;
    }

    function applyFilter() {
        $$('.item-box-list .filter-item').forEach(function (f) { f.classList.remove('is-active'); });
        var icons = $$('.item-box-list svg');
        icons.forEach(function (svg) {
            if ((svg.getAttribute('data-type') || '') === S.filter) svg.closest('.filter-item').classList.add('is-active');
        });
        var q = S.search.toLowerCase();
        $$('.player-inventory .item-slot').forEach(function (e) {
            var item = S.left.items[Number(e.dataset.slot) - 1];
            if (!item || !item.name) { e.style.opacity = ''; return; }
            var ok = true;
            if (S.filter) ok = matchesFilter(item, S.filter);
            if (ok && q) ok = (itemLabel(item).toLowerCase().indexOf(q) !== -1) || (item.name.toLowerCase().indexOf(q) !== -1);
            e.style.opacity = ok ? '' : '0.3';
        });
    }

    var tip = $('.ply-iteminfo-container');

    function stripMd(s) {
        return String(s || '').replace(/[*_`#>]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1');
    }

    var META_LABELS = {
        citizenid: 'CSN', firstname: 'First Name', lastname: 'Last Name', birthdate: 'Birth Date', gender: 'Gender',
        nationality: 'Nationality', type: 'Type', serie: 'Serial Number', serial: 'Serial Number', ammo: 'Ammunition',
        uses: 'Uses Left', cash: 'Amount of cash', worth: 'Worth', lab: 'Lab', costs: 'Items Needed', street: 'Crime Scene',
        label: 'Label', ammotype: 'Type number', ammolabel: 'Caliber', bloodtype: 'Blood type', dnalabel: 'DNA Code',
        fingerprint: 'Fingerprint', name: 'Card Holder', id: 'ID', plate: 'Plate', owner: 'Owner', quality: 'Quality',
        weapontint: 'Tint', components: 'Components', crafted: 'Crafted', registered: 'Registered', mission: 'Mission'
    };
    var META_HIDDEN = ['description', 'durability', 'degrade', 'image', 'imageurl', 'container', 'size', 'weight',
        'specialammo', 'label', 'quality', 'tint', 'items', 'slot', 'count'];
    var MONEY_KEYS = ['cash', 'worth', 'amount', 'price', 'value'];

    function humanize(k) {
        if (META_LABELS[k]) return META_LABELS[k];
        return String(k).replace(/[_\-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function fmtMetaValue(k, v) {
        if (v === null || v === undefined) return '';
        if (k === 'gender') return (v === 1 || v === '1' || String(v).toLowerCase() === 'female' || String(v).toLowerCase() === 'woman') ? 'Woman' : (v === 0 || v === '0' || String(v).toLowerCase() === 'male' || String(v).toLowerCase() === 'man') ? 'Man' : String(v);
        if (typeof v === 'boolean') return v ? 'Yes' : 'No';
        if (typeof v === 'number' && MONEY_KEYS.indexOf(k) !== -1) return '$' + v.toLocaleString('en-us');
        if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'object' ? JSON.stringify(x) : x; }).join(', ');
        if (typeof v === 'object') {
            return Object.keys(v).map(function (kk) { return humanize(kk) + ': ' + fmtMetaValue(kk, v[kk]); }).join(', ');
        }
        return String(v);
    }

    function dline(label, value) {
        return '<p><strong>' + esc(label) + ': </strong><span>' + esc(value) + '</span></p>';
    }

    function detailLines(item, d, invType, isWeapon) {
        var md = item.metadata || {};
        var lines = [];

        if (isWeapon) {
            if (md.serial || md.serie) lines.push(dline(tr('ui_serial', 'Serial Number'), md.serial || md.serie));
            lines.push(dline(tr('ui_ammo', 'Ammunition'), md.ammo !== undefined ? md.ammo : 0));
            if (md.components && md.components.length) {
                var comps = md.components.map(function (c) { var cd = S.itemData[c]; return (cd && cd.label) || c; });
                lines.push(dline(tr('ui_components', 'Components'), comps.join(', ')));
            }
            if (md.weapontint !== undefined) lines.push(dline(tr('ui_tint', 'Tint'), md.weapontint));
        } else if (md.serial) {
            lines.push(dline(tr('ui_serial', 'Serial Number'), md.serial));
        }

        Object.keys(md).forEach(function (k) {
            var lk = k.toLowerCase();
            if (META_HIDDEN.indexOf(lk) !== -1) return;
            if (lk === 'serial' || lk === 'serie' || lk === 'components' || lk === 'weapontint') return;
            if (isWeapon && lk === 'ammo') return;
            var val = fmtMetaValue(lk, md[k]);
            if (val === '') return;
            lines.push(dline(humanize(lk), val));
        });

        S.extraMeta.forEach(function (m) {
            var mk = String(m.metadata).toLowerCase();
            if (md[m.metadata] === undefined || META_HIDDEN.indexOf(mk) !== -1) return;
            var already = lines.some(function (l) { return l.indexOf('<strong>' + esc(humanize(mk)) + ': ') !== -1; });
            if (!already) lines.push(dline(m.value, fmtMetaValue(mk, md[m.metadata])));
        });

        if (invType === 'crafting' && item.ingredients) {
            var ing = Object.keys(item.ingredients).map(function (n) {
                var need = item.ingredients[n];
                var di = S.itemData[n];
                return need + 'x ' + ((di && di.label) || n);
            });
            lines.push(dline('Ingredients', ing.join(', ')));
        }
        if (invType === 'shop' && item.price !== undefined) {
            lines.push(dline('Price', (item.currency && item.currency !== 'money' ? Number(item.price).toLocaleString('en-us') + ' ' + item.currency : '$' + Number(item.price).toLocaleString('en-us'))));
        }
        if (item.count > 0 && item.weight) {
            lines.push(dline('Stack', item.count + ' x ' + fmtWeight(item.weight / item.count)));
        }

        var desc = md.description || d.description;
        if (desc) lines.push('<p style="width:100%">' + esc(stripMd(desc)) + '</p>');
        return lines;
    }

    function showTip(slotEl, item, invType) {
        if (!item || !item.name) return hideTip();
        var d = S.itemData[item.name] || {};
        var isWeapon = item.name.toLowerCase().indexOf('weapon_') === 0;
        $('.item-info-type', tip).textContent = isWeapon ? 'WEAPON TYPE' : 'ITEM TYPE';
        $('.item-info-title', tip).textContent = itemLabel(item);

        var lines = detailLines(item, d, invType, isWeapon);
        $('.item-info-description .desc', tip).innerHTML = lines.join('') || '&nbsp;';

        var dur = $('.durability-bg', tip);
        if (item.durability !== undefined) {
            dur.style.display = '';
            $('.durability-text', tip).textContent = Math.round(item.durability);
        } else dur.style.display = 'none';
        $('.weight-text', tip).textContent = fmtWeight(item.weight || 0);

        tip.style.display = 'block';
        var gap = 4, r = slotEl.getBoundingClientRect();
        var w = tip.offsetWidth, h = tip.offsetHeight;
        var left = r.right + gap, top = r.top;
        if (left + w > window.innerWidth) left = r.left - w - gap;
        if (top + h > window.innerHeight) top = window.innerHeight - h - gap;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = Math.max(0, top) + 'px';
    }
    function hideTip() { tip.style.display = 'none'; }

    function flashError(slotEl) {
        if (!slotEl) return;
        slotEl.classList.add('ox-error');
        setTimeout(function () { slotEl.classList.remove('ox-error'); }, 350);
    }

    function amountFor(from, inv) {
        var input = $('#ox-amount');
        var v = input ? parseInt(input.value, 10) || 0 : 0;
        if (S.shift && from.count > 1 && inv.type !== 'shop') return Math.floor(from.count / 2);
        if (v === 0 || v > from.count) return from.count;
        return v;
    }

    function findTargetSlot(item, inv) {
        var d = S.itemData[item.name];
        var stack = d && d.stack;
        var found;
        if (stack) {
            found = inv.items.find(function (i) { return i.name === item.name && metaEqual(i.metadata, item.metadata); });
            if (found) return found;
        }
        return inv.items.find(function (i) { return i.name === undefined; });
    }

    function snapshot() { return { l: clone(S.left.items), r: clone(S.right.items) }; }
    function restore(s) { S.left.items = s.l; S.right.items = s.r; renderAll(); }

    function applyMove(fromInv, toInv, fromSlot, toSlot, count) {
        var from = fromInv.items[fromSlot - 1];
        var to = toInv.items[toSlot - 1];
        var d = S.itemData[from.name] || {};
        var unit = from.count ? from.weight / from.count : 0;

        if (to && to.name) {
            if (d.stack && to.name === from.name && metaEqual(to.metadata, from.metadata)) {
                to.count += count;
                to.weight = (to.weight / (to.count - count)) * to.count;
                if (count >= from.count) fromInv.items[fromSlot - 1] = { slot: fromSlot };
                else { from.count -= count; from.weight = unit * from.count; }
            } else {
                fromInv.items[fromSlot - 1] = Object.assign({}, to, { slot: fromSlot });
                toInv.items[toSlot - 1] = Object.assign({}, from, { slot: toSlot });
            }
        } else if (count < from.count) {
            var moved = Object.assign({}, from, { slot: toSlot, count: count, weight: unit * count });
            from.count -= count;
            from.weight = unit * from.count;
            toInv.items[toSlot - 1] = moved;
        } else {
            toInv.items[toSlot - 1] = Object.assign({}, from, { slot: toSlot });
            fromInv.items[fromSlot - 1] = { slot: fromSlot };
        }
    }

    function moveItem(fromSide, fromSlot, toSide, toSlot, srcEl, dstEl) {
        if (S.busy) return;
        var fromInv = invBySide(fromSide);
        var toInv = invBySide(toSide);
        var from = fromInv.items[fromSlot - 1];
        if (!from || !from.name) return;
        if (fromSide === toSide && fromSlot === toSlot) return;
        var data = S.itemData[from.name];
        if (data === undefined || data === null) return;

        if (from.metadata && from.metadata.container !== undefined) {
            if (toInv.type === 'container') return;
            if (S.right.id === from.metadata.container) return;
        }
        var to = toInv.items[toSlot - 1];
        if (to === undefined) return;
        if (to.metadata && to.metadata.container !== undefined && S.right.id === to.metadata.container) return;

        if (toSide === 'left' && isEquipSlot(toSlot) && !slotAllows(toSlot, from.name)) return flashError(dstEl);
        if (fromSide === 'left' && toSide === 'left' && to.name && isEquipSlot(fromSlot) && !slotAllows(fromSlot, to.name)) return flashError(dstEl);

        if (isShopLike(fromInv)) {
            if (toSide !== 'left' || !canUse(from, fromInv)) return flashError(srcEl);
            var cnt = from.count ? Math.max(1, Math.min(parseInt(($('#ox-amount') || {}).value, 10) || 1, from.count || 1)) : 1;
            if (fromInv.type === 'shop') {
                post('buyItem', { fromSlot: from.slot, toSlot: toSlot, fromType: fromInv.type, toType: toInv.type, count: cnt });
            } else {
                var times = parseInt(($('#ox-amount') || {}).value, 10) || 1;
                post('craftItem', { fromSlot: from.slot, toSlot: toSlot, fromType: fromInv.type, toType: toInv.type, count: Math.max(1, times) });
            }
            return;
        }
        if (isShopLike(toInv)) return;

        var count = amountFor(from, fromInv);
        var snap = snapshot();
        var payload = { fromSlot: fromSlot, toSlot: toSlot, fromType: fromInv.type, toType: toInv.type, count: count };

        applyMove(fromInv, toInv, fromSlot, toSlot, count);
        renderAll();
        S.busy = true;
        post('swapItems', payload).then(function (ok) {
            S.busy = false;
            if (ok === 'placing') restore(snap);
            else if (ok === false || ok === null) restore(snap);
            else if (typeof ok === 'number') { S.left.maxWeight = ok; renderWeights(); }
        });
    }

    function dropToGround(slot, srcEl) {
        if (S.busy) return;
        var from = S.left.items[slot - 1];
        if (!from || !from.name) return;
        if (isShopLike(S.right) === false && (S.right.type === 'newdrop' || S.right.type === 'drop')) {
            return quickMove('left', slot, srcEl);
        }
        var data = S.itemData[from.name];
        if (data === undefined || data === null) return;
        var count = amountFor(from, S.left);
        var snap = snapshot();
        var tmp = { items: [{ slot: 1 }] };
        applyMove(S.left, tmp, slot, 1, count);
        renderAll();
        S.busy = true;
        post('swapItems', { fromSlot: slot, toSlot: 1, fromType: 'player', toType: 'newdrop', count: count }).then(function (ok) {
            S.busy = false;
            if (ok === 'placing') restore(snap);
            else if (ok === false || ok === null) { restore(snap); flashError(srcEl); }
            else if (typeof ok === 'number') { S.left.maxWeight = ok; renderWeights(); }
        });
    }

    function quickMove(side, slot, srcEl) {
        var fromInv = invBySide(side);
        var toSide = side === 'left' ? 'right' : 'left';
        var toInv = invBySide(toSide);
        var from = fromInv.items[slot - 1];
        if (!from || !from.name) return;
        if (isShopLike(toInv) && !isShopLike(fromInv)) return;
        var target = findTargetSlot(from, toInv);
        if (!target && !isShopLike(fromInv)) return flashError(srcEl);
        if (!target) return flashError(srcEl);
        if (toSide === 'left' && isEquipSlot(target.slot)) {
            var free = toInv.items.find(function (i) { return i.name === undefined && !isEquipSlot(i.slot); });
            if (!free) return flashError(srcEl);
            target = free;
        }
        moveItem(side, slot, toSide, target.slot, srcEl, null);
    }

    function firstFree(inv, fromRange, skipSlot) {
        return inv.items.find(function (i) {
            return i.name === undefined && i.slot !== skipSlot && (!fromRange || (i.slot >= fromRange[0] && i.slot <= fromRange[1]));
        });
    }

    function equipToggle(slot, srcEl) {
        var item = S.left.items[slot - 1];
        if (!item || !item.name) return;
        if (isEquipSlot(slot)) {
            var free = firstFree(S.left, L.pockets) || firstFree(S.left, L.backpack);
            if (!free) return flashError(srcEl);
            moveItem('left', slot, 'left', free.slot, srcEl, null);
        } else {
            var ranges = [L.body, L.accessories];
            for (var r = 0; r < ranges.length; r++) {
                for (var s = ranges[r][0]; s <= ranges[r][1] && s <= S.left.slots; s++) {
                    var cand = S.left.items[s - 1];
                    var list = CONFIG.equipAllow[s];
                    if (cand && !cand.name && list && list.length && ruleMatch(list, item.name)) {
                        return moveItem('left', slot, 'left', s, srcEl, null);
                    }
                }
            }
            flashError(srcEl);
        }
    }

    function canEquip(item) {
        if (!item) return false;
        return Object.keys(CONFIG.equipAllow).some(function (s) {
            var l = CONFIG.equipAllow[s];
            return l && l.length && ruleMatch(l, item.name);
        });
    }

    var drag = null;

    function slotInfo(e) {
        if (!e) return null;
        var side = e.dataset.side;
        var slot = Number(e.getAttribute('data-slot'));
        var inv = invBySide(side);
        return { side: side, slot: slot, item: inv.items[slot - 1], el: e, inv: inv };
    }

    document.addEventListener('mousedown', function (ev) {
        var se = ev.target.closest && ev.target.closest('.item-slot');
        if (!se || !se.dataset.side) return;
        var info = slotInfo(se);
        if (!info || !info.item || !info.item.name) return;
        if (ev.button === 1) {
            ev.preventDefault();
            if (info.side === 'left') post('useItem', info.slot);
            return;
        }
        if (ev.button !== 0) return;
        if (S.busy) return;
        if (!canUse(info.item, info.inv)) return;
        drag = { side: info.side, slot: info.slot, el: se, startX: ev.clientX, startY: ev.clientY, ghost: null, ctrl: ev.ctrlKey, alt: ev.altKey };
    });

    document.addEventListener('mousemove', function (ev) {
        if (!drag) return;
        if (!drag.ghost) {
            if (Math.abs(ev.clientX - drag.startX) + Math.abs(ev.clientY - drag.startY) < 6) return;
            hideTip();
            hideCtx();
            var r = drag.el.getBoundingClientRect();
            var g = drag.el.cloneNode(true);
            g.classList.add('ui-draggable-dragging');
            g.classList.remove('item-hovered');
            g.style.position = 'fixed';
            g.style.width = r.width + 'px';
            g.style.height = r.height + 'px';
            g.style.margin = '0';
            g.style.opacity = '0.75';
            g.style.pointerEvents = 'none';
            g.style.zIndex = '9000';
            var k = $('.item-slot-key', g); if (k) k.remove();
            document.body.appendChild(g);
            drag.ghost = g;
            drag.w = r.width; drag.h = r.height;
            drag.el.style.opacity = '0.35';
            document.body.classList.add('inv-dragging');
        }
        drag.ghost.style.left = (ev.clientX - drag.w / 2) + 'px';
        drag.ghost.style.top = (ev.clientY - drag.h / 2) + 'px';
        $$('.item-slot-hoverClass').forEach(function (x) { x.classList.remove('item-slot-hoverClass'); });
        var under = document.elementFromPoint(ev.clientX, ev.clientY);
        var t = under && under.closest && under.closest('.item-slot');
        if (t && t !== drag.el) t.classList.add('item-slot-hoverClass');
        var dz = $('#ox-dropzone');
        if (dz) dz.classList.toggle('hover', !!(under && under.closest && under.closest('#ox-dropzone')));
    });

    document.addEventListener('mouseup', function (ev) {
        if (!drag) return;
        var d = drag;
        drag = null;
        $$('.item-slot-hoverClass').forEach(function (x) { x.classList.remove('item-slot-hoverClass'); });
        document.body.classList.remove('inv-dragging');
        var dzEl = $('#ox-dropzone'); if (dzEl) dzEl.classList.remove('hover');
        if (d.ghost) {
            d.ghost.remove();
            d.el.style.opacity = '';
            var under = document.elementFromPoint(ev.clientX, ev.clientY);
            var t = under && under.closest && under.closest('.item-slot');
            S.shift = ev.shiftKey;
            if (t && t.dataset.side) {
                var ti = slotInfo(t);
                moveItem(d.side, d.slot, ti.side, ti.slot, d.el, t);
            } else if (d.side === 'left' && under && under.closest && under.closest('#ox-dropzone')) {
                dropToGround(d.slot, d.el);
            } else if (d.side === 'left' && !(under && under.closest && under.closest('.ox-sub, .inv-options, .ox-top, .exit-box, .ox-brand, #split-modal, .help-box'))) {
                dropToGround(d.slot, d.el);
            }
            return;
        }
        if (ev.ctrlKey) quickMove(d.side, d.slot, d.el);
        else if (ev.altKey && d.side === 'left') post('useItem', d.slot);
    });

    document.addEventListener('mouseover', function (ev) {
        if (drag && drag.ghost) return;
        var se = ev.target.closest && ev.target.closest('.item-slot');
        $$('.item-slot.item-hovered').forEach(function (x) { if (x !== se) x.classList.remove('item-hovered'); });
        if (!se || !se.dataset.side || $('.inv-options').style.display === 'block') { if (!se) hideTip(); return; }
        var info = slotInfo(se);
        if (info && info.item && info.item.name) {
            se.classList.add('item-hovered');
            showTip(se, info.item, info.inv.type);
        } else hideTip();
    });
    document.addEventListener('mouseleave', function () { hideTip(); });

    var ctx = $('.inv-options');
    var ctxState = null;

    function hideCtx() { ctx.style.display = 'none'; ctxState = null; }

    function addOption(label, fn, cls) {
        var o = el('div', 'inv-option-item' + (cls ? ' ' + cls : ''));
        o.innerHTML = '<p class="inv-option-item-text">' + esc(label) + '</p>';
        o.addEventListener('click', function (e) { e.stopPropagation(); hideCtx(); fn(); });
        $('.inv-options-list', ctx).appendChild(o);
        return o;
    }

    function openCtx(se, item) {
        var slot = Number(se.dataset.slot);
        var d = S.itemData[item.name] || {};
        var isWeapon = item.name.toLowerCase().indexOf('weapon_') === 0;
        hideTip();
        $('.ctx-name', ctx).textContent = itemLabel(item);
        $('.ctx-type', ctx).textContent = isWeapon ? 'WEAPON TYPE' : 'ITEM TYPE';
        $('.ctx-weight b', ctx).textContent = fmtWeight(item.weight || 0);
        var cd = $('.ctx-dur', ctx);
        if (item.durability === undefined) cd.style.display = 'none';
        else { cd.style.display = 'flex'; $('b', cd).textContent = item.durability.toFixed(1); }

        var list = $('.inv-options-list', ctx);
        list.innerHTML = '';
        list.style.display = 'block';
        addOption(tr('ui_use', 'Use'), function () { post('useItem', slot); });
        if (item.count > 1) addOption('Split', function () { openSplit(item, 'split'); });
        addOption(tr('ui_give', 'Give'), function () {
            if (item.count > 1) openSplit(item, 'give'); else post('giveItem', { slot: slot, count: 0 });
        });
        addOption(tr('ui_drop', 'Drop'), function () { dropToGround(slot, se); });
        if (isEquipSlot(slot) || canEquip(item)) {
            addOption(isEquipSlot(slot) ? 'Unequip' : 'Equip', function () { equipToggle(slot, se); });
        }
        var md = item.metadata || {};
        if (md.ammo > 0) addOption(tr('ui_remove_ammo', 'Remove ammo'), function () { post('removeAmmo', slot); });
        if (md.serial) addOption(tr('ui_copy', 'Copy serial number'), function () {
            var t = document.createElement('textarea'); t.value = md.serial; document.body.appendChild(t); t.select();
            try { document.execCommand('copy'); } catch (e) { }
            t.remove();
        });
        if (md.components && md.components.length) {
            md.components.forEach(function (c) {
                var cdta = S.itemData[c];
                addOption(tr('ui_remove', 'Remove') + ' ' + ((cdta && cdta.label) || c), function () { post('removeComponent', { component: c, slot: slot }); });
            });
        }
        if (d.buttons && d.buttons.length) {
            d.buttons.forEach(function (b, i) {
                addOption(b.label, function () { post('useButton', { id: i + 1, slot: slot }); });
            });
        }

        var first = $('.inv-option-item', list);
        if (first) first.classList.add('sel');

        ctx.style.display = 'block';
        var r = se.getBoundingClientRect();
        var w = ctx.offsetWidth, h = ctx.offsetHeight;
        var left = r.right + 4, top = r.top;
        if (left + w > window.innerWidth) left = r.left - w - 4;
        if (top + h > window.innerHeight) top = window.innerHeight - h - 4;
        ctx.style.left = Math.max(0, left) + 'px';
        ctx.style.top = Math.max(0, top) + 'px';
        ctxState = { slot: slot };
    }

    document.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
        var se = ev.target.closest && ev.target.closest('.item-slot');
        if (!se || !se.dataset.side) return hideCtx();
        if (se.dataset.side !== 'left') return;
        var info = slotInfo(se);
        if (!info.item || !info.item.name) return hideCtx();
        openCtx(se, info.item);
    });

    document.addEventListener('click', function (ev) {
        if (ctx.style.display === 'block' && !ev.target.closest('.inv-options')) hideCtx();
    });

    var modal = $('#split-modal');
    var modalState = null;
    var range = $('.firstRange');
    var amountInput = $('#item-amount');

    function fillRange() {
        var min = Number(range.min), max = Number(range.max);
        range.style.backgroundSize = (max > min ? (range.value - min) * 100 / (max - min) : 100) + '% 100%';
    }

    function openSplit(item, mode) {
        var max = mode === 'give' ? item.count : item.count - 1;
        var def = Math.max(1, Math.floor(item.count / 2));
        modalState = { item: item, mode: mode };
        $('.split-title', modal).textContent = mode === 'give' ? 'GIVE ITEM' : 'SPLIT ITEM';
        $('.split-img', modal).src = itemImage(item);
        amountInput.max = max; amountInput.value = def;
        range.min = 1; range.max = max; range.value = def;
        fillRange();
        modal.style.display = 'flex';
        setTimeout(function () { amountInput.focus(); amountInput.select(); }, 30);
    }
    function closeSplit() { modal.style.display = 'none'; modalState = null; }

    amountInput.addEventListener('input', function () {
        var v = parseInt(this.value, 10);
        if (isNaN(v)) return;
        range.value = v; fillRange();
    });
    range.addEventListener('input', function () { amountInput.value = range.value; fillRange(); });
    amountInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#split-confirm').click(); });
    $('#split-cancel').addEventListener('click', closeSplit);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeSplit(); });
    $('#split-confirm').addEventListener('click', function () {
        if (!modalState) return closeSplit();
        var item = modalState.item;
        var amt = parseInt(amountInput.value, 10);
        if (isNaN(amt) || amt < 1) amt = 1;
        if (amt > Number(amountInput.max)) amt = Number(amountInput.max);
        var mode = modalState.mode;
        closeSplit();
        if (mode === 'give') {
            post('giveItem', { slot: item.slot, count: amt });
        } else {
            var free = firstFree(S.left, null, item.slot);
            if (!free) return;
            var prev = $('#ox-amount');
            var old = prev ? prev.value : 0;
            if (prev) prev.value = amt;
            var sh = S.shift; S.shift = false;
            moveItem('left', item.slot, 'left', free.slot, null, null);
            S.shift = sh;
            if (prev) prev.value = old;
        }
    });

    var root = $('#qbcore-inventory');

    function openUI() {
        S.open = true;
        document.body.style.display = 'block';
        root.style.display = 'block';
    }

    function closeUI(notify) {
        if (!S.open && !notify) return;
        S.open = false;
        hideTip(); hideCtx(); closeSplit();
        root.style.display = 'none';
        $('.health-system').style.display = 'none';
        $('.help-box').style.display = 'none';
        document.body.classList.remove('inv-dragging');
        if (drag && drag.ghost) drag.ghost.remove();
        drag = null;
        S.filter = ''; S.search = '';
        S.fullStash = false; S.inVehicle = false;
        $('#qbcore-inventory').classList.remove('quick-stash');
        var si = $('.invsearch-input'); if (si) si.value = '';
        $('.ox-search-count').textContent = '0/100';
    }

    function applyQuickStash() {
        var quick = S.inVehicle && !S.fullStash;
        $('#qbcore-inventory').classList.toggle('quick-stash', !!quick);
    }

    function setupInventory(data) {
        if (data.equipSlots) CONFIG.equipAllow = data.equipSlots;
        if (data.leftInventory) {
            var l = data.leftInventory;
            S.left = Object.assign(S.left, l);
            S.left.type = S.left.type || 'player';
            prepareInventory(S.left);
        }
        if (data.rightInventory) {
            S.right = Object.assign({ id: '', type: '', slots: 0, maxWeight: 0, items: [] }, data.rightInventory);
            prepareInventory(S.right);
        }
        if (data.inVehicle !== undefined) S.inVehicle = !!data.inVehicle;
        applyQuickStash();
        if (data.leftInventory || data.rightInventory) {
        }
        renderAll();
        openUI();
    }

    function refreshSlots(data) {
        if (data.items) {
            var list = Array.isArray(data.items) ? data.items : [data.items];
            var now = Math.floor(Date.now() / 1000);
            list.forEach(function (u) {
                if (!u || !u.item) return;
                var side = (!u.inventory || u.inventory === 'player') ? 'left' : 'right';
                var inv = invBySide(side);
                var it = u.item;
                if (it.name) { getItemData(it.name); it.durability = durability(it.metadata, now); }
                if (!inv.items[it.slot - 1]) return;
                inv.items[it.slot - 1] = it.name ? it : { slot: it.slot };
            });
            if (S.open) renderAll();
        }
        if (data.itemCount) { }
        if (data.weightData) {
            var w = data.weightData;
            var inv = w.inventoryId === S.left.id ? S.left : w.inventoryId === S.right.id ? S.right : null;
            if (inv) { inv.maxWeight = w.maxWeight; renderWeights(); }
        }
        if (data.slotsData) {
            var sd = data.slotsData;
            var target = sd.inventoryId === S.left.id ? S.left : sd.inventoryId === S.right.id ? S.right : null;
            if (target) { target.slots = sd.slots; prepareInventory(target); renderAll(); }
        }
    }

    var hotbar = $('.z-hotbar-inventory');
    var hotbarTimer = null;
    function toggleHotbar() {
        if (hotbar.style.display === 'flex') { hotbar.style.display = 'none'; return; }
        document.body.style.display = 'block';
        hotbar.innerHTML = '';
        for (var i = 1; i <= CONFIG.hotbarSlots; i++) {
            var item = S.left.items[i - 1];
            var e = el('div', 'item-slot');
            e.setAttribute('data-zhotbarslot', i);
            var h = '<div class="item-slot-img">' + (item && item.name ? '<img src="' + esc(itemImage(item)) + '" draggable="false">' : '') + '</div>';
            if (item && item.name && item.count > 0) h += '<div class="item-slot-amount"><p>' + item.count + ' (' + kg(item.weight) + ')</p></div>';
            if (item && item.name && item.durability !== undefined) {
                var q = Math.max(0, Math.min(100, item.durability));
                h += '<div class="item-slot-quality"><div class="item-slot-quality-bar" style="width:' + q + '%;background-color:' + qualityColor(q) + '"></div></div>';
            }
            e.innerHTML = h;
            hotbar.appendChild(e);
        }
        hotbar.style.display = 'flex';
        clearTimeout(hotbarTimer);
        hotbarTimer = setTimeout(function () { hotbar.style.display = 'none'; }, 3000);
    }

    var NOTIFY_TYPES = { ui_added: 'add', ui_removed: 'remove', ui_holstered: 'use', ui_equipped: 'use' };
    function itemNotify(data) {
        var item = data[0], type = data[1], count = data[2];
        var kind = NOTIFY_TYPES[type] || 'use';
        var stack = $('.notify-stack');
        document.body.style.display = 'block';
        while (stack.children.length > 3) stack.removeChild(stack.firstChild);
        var box = el('div', 'notify-item');
        box.innerHTML = '<div class="notify-icon"><div class="notify-icon-inner"><img src="' + esc(itemImage(item)) + '" alt=""></div></div>' +
            '<span class="notify-name">' + esc((item.metadata && item.metadata.label) || (S.itemData[item.name] && S.itemData[item.name].label) || item.name) + '</span>' +
            '<span class="notify-status notify-' + kind + '">' + esc(tr(type, type)) + ' <span class="notify-amount">' + (count ? 'x' + count : '') + '</span></span>';
        stack.appendChild(box);
        setTimeout(function () { box.classList.add('show'); }, 30);
        setTimeout(function () {
            box.classList.remove('show'); box.classList.add('hide');
            setTimeout(function () { box.remove(); }, 500);
        }, 2500);
    }

    function showHealth(data) {
        var parts = data.parts || {};
        var hs = $('.health-system');
        ['Head', 'Chest', 'RArm', 'LArm', 'RKnee', 'LKnee'].forEach(function (a) {
            var p = parts[a] || { health: 100 };
            var path = $('.wound.' + a, hs);
            if (path) path.style.fill = 'rgba(255, 103, 103, ' + ((100 - p.health) / 100) + ')';
            var t = $('.health-' + a, hs); if (t) t.textContent = Math.round(p.health) + '%';
        });
        var inj = data.injuries && data.injuries[0];
        if (inj) { $('.two-circle .text', hs).textContent = inj.label; $('.two-circle .number', hs).textContent = inj.count; }
        document.body.style.display = 'block';
        hs.style.display = 'block';
        hs.style.transition = 'left 0.6s ease';
        requestAnimationFrame(function () { hs.style.left = '0%'; });
    }
    function hideHealth() {
        var hs = $('.health-system');
        hs.style.left = '-50%';
        setTimeout(function () { hs.style.display = 'none'; }, 300);
    }

    window.addEventListener('message', function (ev) {
        var m = ev.data;
        if (!m || !m.action) return;
        var d = m.data;
        switch (m.action) {
            case 'init':
                S.locale = d.locale || {};
                S.itemData = d.items || {};
                if (d.imagepath) S.imagepath = d.imagepath;
                if (d.equipSlots) CONFIG.equipAllow = d.equipSlots;
                if (d.leftInventory) { S.left = Object.assign(S.left, d.leftInventory); prepareInventory(S.left); }
                if (d.username) { $$('.username').forEach(function (u) { u.textContent = d.username; }); }
                break;
            case 'setupInventory': setupInventory(d || {}); break;
            case 'refreshSlots': refreshSlots(d || {}); break;
            case 'closeInventory': closeUI(true); break;
            case 'setInventoryVisible': d ? openUI() : closeUI(true); break;
            case 'toggleHotbar': toggleHotbar(); break;
            case 'itemNotify': itemNotify(d); break;
            case 'displayMetadata':
                (Array.isArray(d) ? d : [d]).forEach(function (x) {
                    if (x && !S.extraMeta.some(function (e) { return e.value === x.value; })) S.extraMeta.push(x);
                });
                break;
            case 'openplace':
                $$('.place-hand').forEach(function (x) { x.style.display = (d && d.mode === 'place') ? 'none' : 'flex'; });
                $$('.place-aim').forEach(function (x) { x.style.display = (d && d.mode === 'place') ? 'flex' : 'none'; });
                document.body.style.display = 'block';
                $('.place-box').style.display = 'block';
                break;
            case 'closeplace': $('.place-box').style.display = 'none'; break;
            case 'health': showHealth(d || m); break;
            case 'username': $$('.username').forEach(function (u) { u.textContent = d; }); break;
        }
    });

    function requestClose() {
        if (!S.open) { hideHealth(); post('closeHealth'); return; }
        closeUI(true);
        post('exit');
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Shift') S.shift = true;
        if (e.key === 'Control') S.ctrl = true;
        if (!S.open) return;
        if (e.target && /input|textarea/i.test(e.target.tagName)) return;
        if (e.repeat) return;
        var key = (e.key || '').toLowerCase();
        if (key !== 'q' && key !== 'e') return;
        var dir = key === 'e' ? 1 : -1;
        var idx = FILTER_ORDER.indexOf(S.filter);
        S.filter = FILTER_ORDER[(idx + dir + FILTER_ORDER.length) % FILTER_ORDER.length];
        applyFilter();
    });
    document.addEventListener('keyup', function (e) {
        if (e.key === 'Shift') S.shift = false;
        if (e.key === 'Control') S.ctrl = false;
        if (e.key === 'Escape' || e.code === 'Escape') {
            if (modal.style.display === 'flex') return closeSplit();
            if ($('.help-box').style.display === 'block') { $('.help-box').style.display = 'none'; return; }
            if (ctx.style.display === 'block') return hideCtx();
            requestClose();
        }
    });

    $('.exit-box').addEventListener('click', requestClose);
    var fullBtn = $('#full-stash-btn');
    if (fullBtn) fullBtn.addEventListener('click', function () { S.fullStash = true; applyQuickStash(); });
    $('.helpclose').addEventListener('click', function () { $('.help-box').style.display = 'none'; });

    $$('.item-box-list .filter-item').forEach(function (f) {
        f.addEventListener('click', function () {
            var svg = $('svg', f);
            if (!svg) return;
            var type = svg.getAttribute('data-type') || '';
            S.filter = (S.filter === type) ? '' : type;
            applyFilter();
        });
    });

    var search = $('.invsearch-input');
    search.addEventListener('input', function () {
        S.search = this.value || '';
        $('.ox-search-count').textContent = S.search.length + '/100';
        applyFilter();
    });

    ['.ox-phone', '#rob-money', '.char-info'].forEach(function (s) {
        var x = $(s); if (x) x.style.display = 'none';
    });

    (function () {
        var top = $('.ox-top');
        if (!top || $('#ox-amount')) return;
        var wrap = el('div', 'ox-amount-wrap', '<input type="number" id="ox-amount" min="0" value="0" placeholder="AMOUNT"><span class="ox-search-count">QTY</span>');
        top.insertBefore(wrap, $('.ox-search', top).nextSibling);
        var dz = el('div', 'ox-dropzone', '<span class="material-symbols-outlined">south</span><span>DROP</span>');
        dz.id = 'ox-dropzone';
        dz.title = 'Drag an item here to throw it on the ground';
        top.insertBefore(dz, wrap.nextSibling);
        $('#ox-amount').addEventListener('input', function () { if (this.value < 0) this.value = 0; });
    })();

    post('uiLoaded', {});
})();
