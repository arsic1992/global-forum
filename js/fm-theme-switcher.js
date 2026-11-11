/* ==========================================================================
   THE COMMONS - theme switcher (seasons + holidays) + display options
   Add in: Admin Panel > Modules > HTML & Javascript > Javascript codes
   management > Placement: "In all the pages".
   (Replace the previous fm-theme-switcher.js with this file.)

   Works with the <details id="fm-theme-switch"> menu in overall_header.
   - "Automatic" (the default) follows the calendar:
       Mar-May spring, Jun-Aug summer, Sep-Nov autumn, Dec-Feb winter,
       and the holidays:
         Valentine's Day   7 - 14 Feb
         St. Patrick's Day 14 - 17 Mar
         Easter            Palm Sunday to Easter Monday, for the Western
                           and the Orthodox Easter (dates move every year)
         Halloween         17 - 31 Oct
         Christmas         15 - 29 Dec and 3 - 7 Jan (Orthodox Christmas)
         New Year          30 Dec - 2 Jan
   - Picking a theme saves it; picking "Automatic" goes back to the calendar.
   - When a holiday is on but the visitor picked another theme, a small
     banner under the header offers the holiday theme (can be dismissed).
   - "Display" section: text size and on/off options. Each option is a
     class on <html> (fm-pref-...), the look is in the CSS; fm-extras.js
     reads the same classes for its features.
   - Everything is saved in the browser and kept on every visit.
   Errors are written to the browser console with the [fm-theme] prefix.
   ========================================================================== */

(function () {
	'use strict';

	var KEY = 'fmStyle';
	var DKEY = 'fmDisplay';
	var BKEY = 'fmHolidayBanner';
	var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
	var HOLIDAYS = ['valentine', 'stpatrick', 'easter', 'halloween', 'christmas', 'newyear'];
	var HOLIDAY_NAMES = {
		valentine: 'Valentine\'s Day',
		stpatrick: 'St. Patrick\'s Day',
		easter: 'Easter',
		halloween: 'Halloween',
		christmas: 'Christmas',
		newyear: 'New Year'
	};

	/* display options and their allowed values (first = default) */
	var DISPLAY = {
		text: ['m', 's', 'l'],
		flip: [false, true],
		width: [false, true],
		compact: [false, true],
		deco: [false, true],
		readable: [false, true],
		big: [false, true],
		motion: [false, true],
		newfirst: [false, true],
		reldate: [true, false],
		preview: [true, false],
		quotes: [true, false],
		sig: [false, true],
		avatar: [false, true],
		effects: [true, false],
		levels: [true, false]
	};

	/* option -> class on <html> (for on/off options: class when true) */
	var CLASSES = {
		flip: 'fm-pref-flip',
		width: 'fm-pref-comfy',
		compact: 'fm-pref-compact',
		deco: 'fm-pref-nodeco',
		readable: 'fm-pref-readable',
		big: 'fm-pref-big',
		motion: 'fm-pref-motion',
		newfirst: 'fm-pref-unread',
		reldate: 'fm-pref-reldate',
		preview: 'fm-pref-preview',
		quotes: 'fm-pref-quotes',
		sig: 'fm-pref-nosig',
		avatar: 'fm-pref-noavatar',
		effects: 'fm-pref-effects',
		levels: 'fm-pref-levels'
	};

	/* choices saved by older versions */
	var LEGACY = { amber: 'autumn', lagoon: 'summer', ember: 'spring', dusk: 'winter' };

	var root = document.documentElement;

	function log(msg, err) {
		if (window.console && console.error) console.error('[fm-theme] ' + msg, err || '');
	}

	function isSeason(s) {
		return SEASONS.indexOf(s) !== -1 || HOLIDAYS.indexOf(s) !== -1;
	}

	/* Easter Sunday (Western), Gregorian calendar */
	function westernEaster(y) {
		var a = y % 19, b = Math.floor(y / 100), c = y % 100;
		var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
		var g = Math.floor((b - f + 1) / 3);
		var h = (19 * a + b - d - g + 15) % 30;
		var i = Math.floor(c / 4), k = c % 4;
		var l = (32 + 2 * e + 2 * i - h - k) % 7;
		var m = Math.floor((a + 11 * h + 22 * l) / 451);
		var month = Math.floor((h + l - 7 * m + 114) / 31);
		var day = ((h + l - 7 * m + 114) % 31) + 1;
		return new Date(y, month - 1, day);
	}

	/* Easter Sunday (Orthodox), moved to the Gregorian calendar (1900-2099) */
	function orthodoxEaster(y) {
		var a = y % 4, b = y % 7, c = y % 19;
		var d = (19 * c + 15) % 30;
		var e = (2 * a + 4 * b - d + 34) % 7;
		var month = Math.floor((d + e + 114) / 31);
		var day = ((d + e + 114) % 31) + 1;
		return new Date(y, month - 1, day + 13);
	}

	/* holiday running on a date (default today), or null */
	function currentHoliday(date) {
		var d = date || new Date();
		var y = d.getFullYear();
		var m = d.getMonth(); /* 0 = January */
		var day = d.getDate();
		var today = new Date(y, m, day);

		if ((m === 11 && day >= 30) || (m === 0 && day <= 2)) return 'newyear';
		if ((m === 11 && day >= 15) || (m === 0 && day <= 7)) return 'christmas';
		if (m === 1 && day >= 7 && day <= 14) return 'valentine';
		if (m === 2 && day >= 14 && day <= 17) return 'stpatrick';
		if (m >= 2 && m <= 4) {
			/* Palm Sunday to Easter Monday, for both Easters */
			var easters = [westernEaster(y), orthodoxEaster(y)];
			for (var i = 0; i < easters.length; i++) {
				var from = new Date(easters[i]);
				from.setDate(from.getDate() - 7);
				var to = new Date(easters[i]);
				to.setDate(to.getDate() + 1);
				if (today >= from && today <= to) return 'easter';
			}
		}
		if (m === 9 && day >= 17) return 'halloween';
		return null;
	}

	/* for the other scripts (effects, countdown) */
	window.fmHoliday = currentHoliday;
	window.fmHolidayNames = HOLIDAY_NAMES;

	function calendarSeason() {
		var h = currentHoliday();
		if (h) return h;
		var m = new Date().getMonth();
		if (m >= 2 && m <= 4) return 'spring';
		if (m >= 5 && m <= 7) return 'summer';
		if (m >= 8 && m <= 10) return 'autumn';
		return 'winter';
	}

	function store(key, value) {
		try {
			if (value === null) {
				window.localStorage.removeItem(key);
			} else {
				window.localStorage.setItem(key, value);
			}
		} catch (e) {
			log('could not save (storage blocked?)', e);
		}
	}

	function read(key) {
		try {
			return window.localStorage.getItem(key);
		} catch (e) {
			return null;
		}
	}

	function readSaved() {
		var s = read(KEY);
		if (LEGACY[s]) {
			s = LEGACY[s];
			store(KEY, s);
		}
		return isSeason(s) ? s : null;
	}

	function apply(name) {
		if (!isSeason(name)) name = calendarSeason();
		root.setAttribute('data-style', name);
		/* an old version wrote colours inline; clear them so the CSS wins */
		var inline = ['bg', 'surface', 'card', 'card-2', 'line', 'ink', 'muted', 'accent', 'on-accent', 'new', 'old', 'lock'];
		for (var i = 0; i < inline.length; i++) root.style.removeProperty('--fm-' + inline[i]);
		return name;
	}

	/* ---------- display options ---------- */

	var display = {};

	function readDisplay() {
		var d = {};
		try {
			d = JSON.parse(read(DKEY) || '{}') || {};
		} catch (e) {
			d = {};
		}
		/* older version stored the width as 'full' / 'comfy' */
		if (d.width === 'comfy') d.width = true;
		if (d.width === 'full') d.width = false;
		var out = {};
		for (var k in DISPLAY) {
			if (!DISPLAY.hasOwnProperty(k)) continue;
			out[k] = DISPLAY[k].indexOf(d[k]) !== -1 ? d[k] : DISPLAY[k][0];
		}
		return out;
	}

	function setClass(name, on) {
		if (on) {
			root.classList.add(name);
		} else {
			root.classList.remove(name);
		}
	}

	function applyDisplay() {
		setClass('fm-pref-text-s', display.text === 's');
		setClass('fm-pref-text-l', display.text === 'l');
		for (var k in CLASSES) {
			if (CLASSES.hasOwnProperty(k)) setClass(CLASSES[k], display[k] === true);
		}
		/* tell fm-extras.js (and anything else) that options changed */
		try {
			window.dispatchEvent(new CustomEvent('fm:display', { detail: display }));
		} catch (e) { /* very old browsers */ }
	}

	function markDisplay() {
		var opts = document.querySelectorAll('.fm-disp-opt');
		for (var i = 0; i < opts.length; i++) {
			var on = String(display[opts[i].getAttribute('data-pref')]) === opts[i].getAttribute('data-value');
			opts[i].setAttribute('aria-checked', on ? 'true' : 'false');
			if (on) {
				opts[i].classList.add('is-active');
			} else {
				opts[i].classList.remove('is-active');
			}
		}
		var toggles = document.querySelectorAll('.fm-disp-toggle');
		for (var j = 0; j < toggles.length; j++) {
			var v = display[toggles[j].getAttribute('data-pref')] === true;
			toggles[j].setAttribute('aria-checked', v ? 'true' : 'false');
		}
	}

	function setDisplay(pref, value) {
		if (pref === 'reset') {
			for (var k in DISPLAY) {
				if (DISPLAY.hasOwnProperty(k)) display[k] = DISPLAY[k][0];
			}
		} else if (DISPLAY[pref]) {
			if (DISPLAY[pref].indexOf(value) === -1) return;
			display[pref] = value;
		} else {
			return;
		}
		applyDisplay();
		store(DKEY, JSON.stringify(display));
		markDisplay();
	}

	window.fmSetDisplay = function (pref, value) {
		try {
			setDisplay(pref, value);
		} catch (e) {
			log('could not change display option', e);
		}
	};

	window.fmGetDisplay = function () {
		return display;
	};

	/* ---------- menu ---------- */

	function mark() {
		var saved = readSaved();
		var c = root.getAttribute('data-style');
		var opts = document.querySelectorAll('.fm-theme-opt');
		for (var i = 0; i < opts.length; i++) {
			var s = opts[i].getAttribute('data-style');
			var on = s === 'auto' ? !saved : (saved && s === c);
			opts[i].setAttribute('aria-checked', on ? 'true' : 'false');
			if (!saved && s === c) {
				opts[i].classList.add('is-current');
			} else {
				opts[i].classList.remove('is-current');
			}
			if (on) {
				opts[i].classList.add('is-active');
			} else {
				opts[i].classList.remove('is-active');
			}
		}
		markDisplay();
	}

	function closeMenu() {
		var sw = document.getElementById('fm-theme-switch');
		if (sw) sw.removeAttribute('open');
	}

	function findUp(el, cls) {
		while (el && el !== document) {
			if (el.classList && el.classList.contains(cls)) return el;
			el = el.parentNode;
		}
		return null;
	}

	window.fmSetStyle = function (name) {
		try {
			if (name === 'auto') {
				store(KEY, null);
				apply(calendarSeason());
			} else {
				if (!isSeason(name)) return;
				apply(name);
				store(KEY, name);
			}
			mark();
			closeMenu();
			updateBanner();
		} catch (e) {
			log('could not switch season', e);
		}
	};

	/* ---------- holiday banner ---------- */

	function bannerKey(h) {
		return h + '-' + new Date().getFullYear();
	}

	function updateBanner() {
		var old = document.getElementById('fm-holiday-banner');
		var h = currentHoliday();
		var saved = readSaved();
		var show = h && saved && saved !== h && read(BKEY) !== bannerKey(h);
		if (!show) {
			if (old) old.parentNode.removeChild(old);
			return;
		}
		if (old) return;
		var anchor = document.getElementById('page-header') || document.querySelector('.fm-topnav');
		if (!anchor || !anchor.parentNode) return;

		var b = document.createElement('div');
		b.id = 'fm-holiday-banner';
		b.className = 'fm-holiday-banner fm-holiday-' + h;
		b.innerHTML =
			'<span class="fm-hb-ico" aria-hidden="true"></span>' +
			'<span class="fm-hb-text">The <strong>' + HOLIDAY_NAMES[h] + '</strong> theme is here!</span>' +
			'<button type="button" class="fm-hb-try">Try it</button>' +
			'<button type="button" class="fm-hb-close" title="Hide" aria-label="Hide"></button>';
		anchor.parentNode.insertBefore(b, anchor.nextSibling);

		b.querySelector('.fm-hb-try').addEventListener('click', function () {
			window.fmSetStyle(h);
		});
		b.querySelector('.fm-hb-close').addEventListener('click', function () {
			store(BKEY, bannerKey(h));
			updateBanner();
		});
	}

	/* 1) theme and display options, right away (before the page paints) */
	apply(readSaved() || calendarSeason());
	display = readDisplay();
	applyDisplay();

	/* 2) clicks: capture phase on window, so nothing else can swallow them */
	window.addEventListener('click', function (e) {
		var opt = findUp(e.target, 'fm-theme-opt');
		if (opt) {
			e.preventDefault();
			window.fmSetStyle(opt.getAttribute('data-style'));
			return;
		}

		/* display options keep the menu open, so several can be changed */
		var d = findUp(e.target, 'fm-disp-opt');
		if (d) {
			e.preventDefault();
			window.fmSetDisplay(d.getAttribute('data-pref'), d.getAttribute('data-value'));
			return;
		}
		var t = findUp(e.target, 'fm-disp-toggle');
		if (t) {
			e.preventDefault();
			var p = t.getAttribute('data-pref');
			window.fmSetDisplay(p, display[p] !== true);
			return;
		}
		if (findUp(e.target, 'fm-disp-reset')) {
			e.preventDefault();
			window.fmSetDisplay('reset');
			return;
		}

		var sw = document.getElementById('fm-theme-switch');
		if (sw && sw.hasAttribute('open') && !sw.contains(e.target)) closeMenu();
	}, true);

	window.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' || e.keyCode === 27) closeMenu();
	}, true);

	/* 3) once the page exists: mark the menu, show the banner if needed */
	function ready() {
		if (!document.getElementById('fm-theme-switch')) {
			log('menu #fm-theme-switch not found \u2014 is the overall_header template saved?');
		}
		mark();
		updateBanner();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', ready);
	} else {
		ready();
	}
})();
