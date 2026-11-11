/* ==========================================================================
   THE COMMONS - "Copy" button for code blocks
   Add in: Admin Panel > Modules > HTML & Javascript > Javascript codes
   management > Create a new JS > Placement: "In all the pages"
   (code also appears in previews, PMs and search results).

   Puts a Copy button on the right of every code block header ("Code:").
   Clicking copies the code and the button shows "Copied" for 2 seconds.
   Spoilers (dl.codebox.spoiler) are left alone.
   ========================================================================== */

(function () {
	'use strict';

	var LABEL = 'Copy';
	var DONE = 'Copied';

	function copyText(text, done) {
		if (navigator.clipboard && window.isSecureContext) {
			navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
		} else {
			fallback(text, done);
		}
	}

	function fallback(text, done) {
		var ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'fixed';
		ta.style.top = '-1000px';
		document.body.appendChild(ta);
		ta.select();
		try { document.execCommand('copy'); done(); } catch (e) {
			if (window.console) console.error('[fm-copy] copy failed', e);
		}
		document.body.removeChild(ta);
	}

	function addButton(box) {
		if (box.getAttribute('data-fm-copy')) return;
		var dt = box.querySelector('dt');
		var code = box.querySelector('dd code') || box.querySelector('dd');
		if (!dt || !code) return;
		box.setAttribute('data-fm-copy', '1');

		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'fm-copy-btn';
		btn.textContent = LABEL;
		btn.addEventListener('click', function (e) {
			e.preventDefault();
			e.stopPropagation();
			copyText(code.innerText || code.textContent || '', function () {
				btn.textContent = DONE;
				btn.classList.add('is-copied');
				clearTimeout(btn._t);
				btn._t = setTimeout(function () {
					btn.textContent = LABEL;
					btn.classList.remove('is-copied');
				}, 2000);
			});
		});
		dt.appendChild(btn);
	}

	function run() {
		var boxes = document.querySelectorAll('dl.codebox:not(.spoiler)');
		for (var i = 0; i < boxes.length; i++) addButton(boxes[i]);
	}

	var queued = false;
	function schedule() {
		if (queued) return;
		queued = true;
		setTimeout(function () { queued = false; run(); }, 150);
	}

	function start() {
		run();
		/* posts added later (quick reply preview, ajax) */
		if (window.MutationObserver) {
			new MutationObserver(function (list) {
				for (var i = 0; i < list.length; i++) {
					if (list[i].addedNodes.length) { schedule(); return; }
				}
			}).observe(document.body, { childList: true, subtree: true });
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();
