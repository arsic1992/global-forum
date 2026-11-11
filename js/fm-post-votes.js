/* ==========================================================================
   THE COMMONS - post reputation counts
   Add in: Admin Panel > Modules > HTML & Javascript > Javascript codes
   management > Create a new JS > Placement: "In the topics" (or all pages).

   Forumotion only exposes the reputation as a percentage and a total in the
   bar's title, e.g. "Message reputation : 67% (3 votes)". This script turns
   that into real numbers: how many voted up and how many voted down, and
   shows them on the vote rail (+N above the bar, -N below it).
   It also re-runs when Forumotion updates the vote box after you click.
   ========================================================================== */

(function () {
	'use strict';

	function parse(title) {
		/* "...: 67% (3 votes)" -> { up: 2, down: 1 } ; "not voted" -> 0 / 0 */
		var pct = /(\d+(?:[.,]\d+)?)\s*%/.exec(title || '');
		var total = /\((\d+)/.exec(title || '');
		if (!pct || !total) return { up: 0, down: 0 };
		var t = parseInt(total[1], 10) || 0;
		var p = parseFloat(pct[1].replace(',', '.')) || 0;
		var up = Math.round(t * p / 100);
		return { up: up, down: Math.max(0, t - up) };
	}

	function badge(cls, text, label) {
		var s = document.createElement('span');
		s.className = 'fm-vote-count ' + cls;
		s.textContent = text;
		s.title = label;
		return s;
	}

	function decorate(box) {
		if (box.querySelector('.fm-vote-count')) return; /* already done */
		var bar = box.querySelector('.vote-bar, .vote-no-bar');
		if (!bar) return;
		var n = parse(bar.getAttribute('title'));
		box.insertBefore(badge('fm-vote-up', '+' + n.up, n.up + ' up'), bar);
		if (bar.nextSibling) {
			box.insertBefore(badge('fm-vote-down', '\u2212' + n.down, n.down + ' down'), bar.nextSibling);
		} else {
			box.appendChild(badge('fm-vote-down', '\u2212' + n.down, n.down + ' down'));
		}
		box.classList.add('fm-vote-ready');
	}

	function run() {
		try {
			var boxes = document.querySelectorAll('.post .vote');
			for (var i = 0; i < boxes.length; i++) decorate(boxes[i]);
		} catch (e) {
			if (window.console) console.error('[fm-votes]', e);
		}
	}

	var queued = false;
	function schedule() {
		if (queued) return;
		queued = true;
		(window.requestAnimationFrame || setTimeout)(function () {
			queued = false;
			run();
		});
	}

	function start() {
		run();
		if (!window.MutationObserver) return;
		/* Forumotion swaps the vote box content after a vote */
		new MutationObserver(function (list) {
			for (var i = 0; i < list.length; i++) {
				var t = list[i].target;
				if (t.nodeType === 1 && (t.closest ? t.closest('.vote') || t.querySelector('.vote') : true)) {
					schedule();
					return;
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();
