/* ==========================================================================
   THE COMMONS - user menu + notifications in the top navigation
   Add in: Admin Panel > Modules > HTML & Javascript > Javascript codes
   management > Create a new JS > Placement: "In all the pages".

   - Waits for Forumotion's toolbar (#fa_toolbar), takes its right part
     (#fa_right: welcome menu, notifications, guest links) and moves it to
     the right end of our navigation bar (.fm-topnav).
   - The welcome link gets the member's avatar, "Notifications" becomes a
     bell with a number badge.
   - Menus open/close on click (outside click / Esc closes them).
   - The rest of the toolbar is hidden by the CSS.
   Errors go to the console with the [fm-usernav] prefix.
   ========================================================================== */

(function () {
	'use strict';

	var DONE = 'data-fm-usernav';

	function log(msg, err) {
		if (window.console && console.error) console.error('[fm-usernav] ' + msg, err || '');
	}

	function closeAll(except) {
		var open = document.querySelectorAll('.fm-usernav .fm-open');
		for (var i = 0; i < open.length; i++) {
			if (open[i] !== except) open[i].classList.remove('fm-open');
		}
	}

	/* "(3)" / "3" / "" -> badge text */
	function updateBadge(source, badge) {
		var m = /(\d+)/.exec(source.textContent || '');
		var n = m ? parseInt(m[1], 10) : 0;
		badge.textContent = n > 99 ? '99+' : String(n);
		badge.style.display = n > 0 ? '' : 'none';
	}

	function build(right, nav) {
		if (right.getAttribute(DONE)) return;
		right.setAttribute(DONE, '1');
		right.classList.add('fm-usernav');

		/* --- member menu --- */
		var menu = right.querySelector('#fa_menu');
		var welcome = right.querySelector('#fa_welcome');
		if (menu && welcome) {
			menu.classList.add('fm-um');
			var av = right.querySelector('#fa_usermenu img');
			if (av && !welcome.querySelector('.fm-um-avatar')) {
				var small = document.createElement('img');
				small.className = 'fm-um-avatar';
				small.src = av.getAttribute('src');
				small.alt = '';
				welcome.insertBefore(small, welcome.firstChild);
			}
			/* keep the text in its own span so it can be shortened on phones */
			var txt = [];
			for (var i = 0; i < welcome.childNodes.length; i++) {
				if (welcome.childNodes[i].nodeType === 3) txt.push(welcome.childNodes[i]);
			}
			if (txt.length) {
				var label = document.createElement('span');
				label.className = 'fm-um-name';
				label.textContent = txt.map(function (t) { return t.nodeValue; }).join('').trim();
				txt.forEach(function (t) { t.parentNode.removeChild(t); });
				welcome.appendChild(label);
			}
			welcome.setAttribute('role', 'button');
			welcome.setAttribute('tabindex', '0');
			welcome.addEventListener('click', function (e) {
				e.preventDefault();
				var willOpen = !menu.classList.contains('fm-open');
				closeAll();
				if (willOpen) menu.classList.add('fm-open');
			});
		}

		/* --- notifications --- */
		var bell = right.querySelector('#fa_notifications');
		var list = right.querySelector('#notif_list');
		if (bell && list) {
			var wrap = document.createElement('div');
			wrap.className = 'fm-notif';
			bell.parentNode.insertBefore(wrap, bell);
			wrap.appendChild(bell);
			wrap.appendChild(list);

			var badge = document.createElement('span');
			badge.className = 'fm-notif-count';
			bell.appendChild(badge);
			bell.setAttribute('role', 'button');
			bell.setAttribute('tabindex', '0');
			bell.setAttribute('title', (bell.textContent || 'Notifications').replace(/\(\d+\)|\d+/g, '').trim());

			var unread = right.querySelector('#notif_unread');
			if (unread) {
				updateBadge(unread, badge);
				if (window.MutationObserver) {
					new MutationObserver(function () { updateBadge(unread, badge); })
						.observe(unread, { childList: true, characterData: true, subtree: true });
				}
			} else {
				badge.style.display = 'none';
			}

			bell.addEventListener('click', function (e) {
				e.preventDefault();
				var willOpen = !wrap.classList.contains('fm-open');
				closeAll();
				if (willOpen) wrap.classList.add('fm-open');
			});
		}

		nav.appendChild(right);
		nav.classList.add('fm-has-usernav');
		document.documentElement.classList.add('fm-toolbar-moved');
	}

	function tryBuild() {
		var right = document.getElementById('fa_right');
		var nav = document.querySelector('.fm-topnav');
		if (!right || !nav) return false;
		try {
			build(right, nav);
		} catch (e) {
			log('could not move the toolbar menu', e);
		}
		return true;
	}

	/* close on outside click / Esc */
	document.addEventListener('click', function (e) {
		if (!e.target.closest || !e.target.closest('.fm-usernav')) closeAll();
	}, true);

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' || e.keyCode === 27) closeAll();
	}, true);

	/* the toolbar is built by Forumotion's own script, so wait for it */
	function start() {
		if (tryBuild()) return;
		if (!window.MutationObserver) return;
		var obs = new MutationObserver(function () {
			if (tryBuild()) obs.disconnect();
		});
		obs.observe(document.body, { childList: true, subtree: true });
		setTimeout(function () { obs.disconnect(); }, 15000);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();
