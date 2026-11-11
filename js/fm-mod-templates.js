/* ==========================================================================
   THE COMMONS - "Templates" button in the editor (staff notices)
   Add in: Admin Panel > Modules > HTML & Javascript > Javascript codes
   management > Create a new JS > Placement: "In all the pages".

   - Adds a "Templates" button to every editor toolbar (only for the
     members allowed below). It opens a small menu; picking an item puts
     the ready-made BBCode at the end of the message.
   - The boxes are styled by the theme (they follow the current theme's
     colours): [table class="info|warn|tut|ban|gallery"]
       row 1 = header: first line is the small label, second line the title
       row 2 = the text
       row 3 = the footer (signature)
   - In posts, it also removes the empty lines Forumotion adds above
     BBCode tables, so the boxes do not start with a gap.
   Errors go to the console with the [fm-tpl] prefix.
   ========================================================================== */

(function () {
	'use strict';

	/* ---------- WHO SEES THE BUTTON ----------
	   Forumotion gives the member's level in _userdata.user_level:
	   1 = administrator, 2 = moderator, 0 = member.
	   Set to [0, 1, 2] to let everybody use it. */
	var ALLOWED_LEVELS = [1, 2];

	/* text used in the footers */
	var STAFF = 'The Staff';

	/* ---------- THE TEMPLATES (edit the text as you like) ----------
	   type = the box style: info, warn, tut, ban or gallery */
	var TEMPLATES = [
		{
			name: 'Info template',
			type: 'info',
			code:
				'[table class="info"]\n' +
				'[tr][td]Information\n' +
				'Title of the announcement[/td][/tr]\n' +
				'[tr][td]Write the information here.\n' +
				'\n' +
				'You can use as many lines as you need.[/td][/tr]\n' +
				'[tr][td]' + STAFF + '[/td][/tr]\n' +
				'[/table]'
		},
		{
			name: 'Warning template',
			type: 'warn',
			code:
				'[table class="warn"]\n' +
				'[tr][td]Warning\n' +
				'Reason for the warning[/td][/tr]\n' +
				'[tr][td]Member: \n' +
				'Rule broken: \n' +
				'What happens next: \n' +
				'\n' +
				'Please read the forum rules again.[/td][/tr]\n' +
				'[tr][td]Issued by ' + STAFF + '[/td][/tr]\n' +
				'[/table]'
		},
		{
			name: 'Tutorial template',
			type: 'tut',
			code:
				'[table class="tut"]\n' +
				'[tr][td]Tutorial\n' +
				'How to change your avatar[/td][/tr]\n' +
				'[tr][td]This is the body of the tutorial.\n' +
				'\n' +
				'Step 1: open your profile.\n' +
				'Step 2: click the avatar tab.[/td][/tr]\n' +
				'[tr][td]Written by ' + STAFF + '[/td][/tr]\n' +
				'[/table]'
		},
		{
			name: 'Ban template',
			type: 'ban',
			code:
				'[table class="ban"]\n' +
				'[tr][td]Ban\n' +
				'Member name[/td][/tr]\n' +
				'[tr][td]Reason: \n' +
				'Duration: \n' +
				'Banned by: \n' +
				'\n' +
				'You can appeal this decision by sending a private message to the staff.[/td][/tr]\n' +
				'[tr][td]Decision by ' + STAFF + '[/td][/tr]\n' +
				'[/table]'
		},
		{
			name: 'Gallery template',
			type: 'gallery',
			code:
				'[table class="gallery"]\n' +
				'[tr][td]Gallery\n' +
				'Title of the gallery[/td][/tr]\n' +
				'[tr][td][img]https://example.com/picture-1.jpg[/img]\n' +
				'[img]https://example.com/picture-2.jpg[/img]\n' +
				'[img]https://example.com/picture-3.jpg[/img][/td][/tr]\n' +
				'[tr][td]Pictures shared by ' + STAFF + '[/td][/tr]\n' +
				'[/table]'
		}
	];

	var TYPES = ['info', 'warn', 'tut', 'ban', 'gallery'];

	function log(msg, err) {
		if (window.console && console.error) console.error('[fm-tpl] ' + msg, err || '');
	}

	function allowed() {
		var ud = window._userdata;
		if (!ud) return false;
		return ALLOWED_LEVELS.indexOf(+ud.user_level) !== -1 && +ud.session_logged_in !== 0;
	}

	/* ---------- dropdown menu (one for the whole page) ---------- */

	var menu = null, current = null, currentBtn = null;

	function buildMenu() {
		menu = document.createElement('div');
		menu.className = 'fm-tpl-menu';
		menu.setAttribute('role', 'menu');
		menu.style.display = 'none';
		for (var i = 0; i < TEMPLATES.length; i++) {
			var item = document.createElement('a');
			item.href = '#';
			item.className = 'fm-tpl-item fm-tpl-' + TEMPLATES[i].type;
			item.setAttribute('role', 'menuitem');
			item.setAttribute('data-index', i);
			item.innerHTML = '<span class="fm-tpl-dot" aria-hidden="true"></span>' + TEMPLATES[i].name;
			menu.appendChild(item);
		}
		document.body.appendChild(menu);

		menu.addEventListener('click', function (e) {
			var item = e.target.closest ? e.target.closest('.fm-tpl-item') : null;
			if (!item) return;
			e.preventDefault();
			var tpl = TEMPLATES[parseInt(item.getAttribute('data-index'), 10)];
			if (tpl && current) insert(current, tpl.code);
			close();
		});
	}

	function close() {
		if (menu) menu.style.display = 'none';
		if (currentBtn) currentBtn.classList.remove('is-open');
		current = null;
		currentBtn = null;
	}

	function open(btn, container) {
		current = container;
		currentBtn = btn;
		btn.classList.add('is-open');
		menu.style.display = 'block';
		var r = btn.getBoundingClientRect();
		menu.style.top = (r.bottom + 6) + 'px';
		menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
	}

	/* ---------- put the BBCode into the message ---------- */

	function editorFor(container) {
		if (!window.jQuery) return null;
		var ta = container.parentNode ? container.parentNode.querySelector('textarea#text_editor_textarea, textarea[name="message"]') : null;
		if (!ta) return null;
		try {
			var inst = window.jQuery(ta).sceditor('instance');
			return inst && inst.val ? inst : null;
		} catch (e) {
			return null;
		}
	}

	function glue(value) {
		return value && !/\n$/.test(value) ? '\n\n' : (value ? '\n' : '');
	}

	function insert(container, text) {
		/* tables are easiest to edit as BBCode: switch to source mode */
		var inst = editorFor(container);
		if (inst) {
			try {
				if (inst.sourceMode && !inst.sourceMode()) inst.sourceMode(true);
				var v = inst.val() || '';
				inst.val(v + glue(v) + text);
				inst.focus();
				var src = container.querySelector('textarea');
				if (src) {
					src.selectionStart = src.selectionEnd = src.value.length;
					src.scrollTop = src.scrollHeight;
				}
				window.dispatchEvent(new Event('fm:inserted'));
				return;
			} catch (e) {
				log('editor insert failed, using the text box', e);
			}
		}

		if (!container.classList.contains('sourceMode')) {
			var sourceBtn = container.querySelector('.sceditor-button-source');
			if (sourceBtn) sourceBtn.click();
		}
		var ta = container.querySelector('textarea');
		if (!ta) return;
		ta.value = ta.value + glue(ta.value) + text;
		ta.focus();
		ta.selectionStart = ta.selectionEnd = ta.value.length;
		ta.scrollTop = ta.scrollHeight;
		ta.dispatchEvent(new Event('input', { bubbles: true }));
		ta.dispatchEvent(new Event('change', { bubbles: true }));
		window.dispatchEvent(new Event('fm:inserted'));
	}

	/* ---------- the toolbar button ---------- */

	function addButton(toolbar) {
		if (toolbar.querySelector('.sceditor-button-templates')) return;
		var container = toolbar.closest('.sceditor-container');
		if (!container) return;

		var group = document.createElement('div');
		group.className = 'sceditor-group fm-tpl-group';
		var btn = document.createElement('a');
		btn.className = 'sceditor-button sceditor-button-templates';
		btn.setAttribute('unselectable', 'on');
		btn.setAttribute('title', 'Templates');
		btn.setAttribute('aria-haspopup', 'true');
		btn.innerHTML = '<div unselectable="on">Templates</div>';
		btn.addEventListener('click', function (e) {
			e.preventDefault();
			e.stopPropagation();
			if (menu.style.display === 'block' && current === container) {
				close();
			} else {
				open(btn, container);
			}
		});
		group.appendChild(btn);
		toolbar.appendChild(group);
	}

	function scan() {
		var bars = document.querySelectorAll('.sceditor-toolbar');
		for (var i = 0; i < bars.length; i++) addButton(bars[i]);
	}

	/* ---------- in posts: remove the empty lines above the boxes ----------
	   Each line break between [table], [tr] and [/table] in the BBCode becomes
	   a <br> that the browser moves above the table. */
	function tidyBoxes() {
		var sel = TYPES.map(function (t) { return 'table.' + t; }).join(',');
		var boxes = document.querySelectorAll(sel);
		for (var i = 0; i < boxes.length; i++) {
			var t = boxes[i];
			if (t.getAttribute('data-fm-tidy')) continue;
			t.setAttribute('data-fm-tidy', '1');
			t.classList.add('fm-notice');
			var extra = t.querySelectorAll('tr').length + 1;
			var n = t.previousSibling;
			while (n && extra > 0) {
				var prev = n.previousSibling;
				if (n.nodeType === 3 && !n.nodeValue.trim()) {
					n = prev;
					continue;
				}
				if (n.nodeType === 1 && n.tagName === 'BR') {
					n.parentNode.removeChild(n);
					extra--;
					n = prev;
					continue;
				}
				break;
			}
		}
	}

	function start() {
		try { tidyBoxes(); } catch (e) { log('tidy failed', e); }
		if (!allowed()) return;
		buildMenu();
		scan();

		/* the editor builds its toolbar after the page has loaded */
		var queued = false;
		new MutationObserver(function () {
			if (queued) return;
			queued = true;
			setTimeout(function () {
				queued = false;
				scan();
			}, 100);
		}).observe(document.body, { childList: true, subtree: true });

		document.addEventListener('click', function (e) {
			if (!menu || menu.style.display === 'none') return;
			if (e.target.closest && (e.target.closest('.fm-tpl-menu') || e.target.closest('.sceditor-button-templates'))) return;
			close();
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') close();
		});
		window.addEventListener('scroll', close, true);
		window.addEventListener('resize', close);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();
