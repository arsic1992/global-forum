/* ==========================================================================
   THE COMMONS - reading extras
   Add in: Admin Panel > Modules > HTML & Javascript > Javascript codes
   management > Create a new JS > Placement: "In all the pages".
   Needs fm-theme-switcher.js (for the on/off options in the Display menu).

   - Reading progress bar on topic pages (thin line under the navigation)
   - "First unread" button in topics that have unread posts
   - Long quotes fold to a few lines with "Show more"   (Display: Fold long quotes)
   - Click an image in a post to see it full size (lightbox)
   - "N new" badge on each index category with unread forums
   - Dates as "3 hours ago" in lists and posts         (Display: Dates as ...)
   - Topic preview card when hovering a topic title    (Display: Topic preview)
   - Your own posts get a "You" mark in topics
   - Writing: word & character count under the editor, a warning before
     leaving a page with an unsent message, and "Quote" on selected text
   - Levels & badges: experience from posts and reputation, a level ring
     around avatars, an XP bar and badges            (Display: Levels & badges)
   - Private messages grouped into conversations: all pages of the folder
     are read, messages with the same subject and person become one
     conversation, and a click shows the whole conversation in order

   Every feature is separate: if one fails, the others still run.
   Errors go to the console with the [fm-extras] prefix.
   ========================================================================== */

(function () {
	'use strict';

	var root = document.documentElement;

	function log(msg, err) {
		if (window.console && console.error) console.error('[fm-extras] ' + msg, err || '');
	}

	function on(cls) {
		return root.classList.contains(cls);
	}

	function safe(name, fn) {
		try {
			fn();
		} catch (e) {
			log(name + ' failed', e);
		}
	}

	/* ======================================================================
	   1) Reading progress bar (topic pages only)
	   ====================================================================== */
	function progressBar() {
		if (!document.querySelector('.post.fm-post')) return;
		var bar = document.createElement('div');
		bar.className = 'fm-progress';
		bar.setAttribute('aria-hidden', 'true');
		bar.innerHTML = '<span></span>';
		document.body.appendChild(bar);
		var fill = bar.firstChild;
		var queued = false;

		function update() {
			queued = false;
			var max = document.documentElement.scrollHeight - window.innerHeight;
			var p = max > 0 ? Math.min(1, Math.max(0, window.pageYOffset / max)) : 0;
			fill.style.transform = 'scaleX(' + p + ')';
		}
		function schedule() {
			if (queued) return;
			queued = true;
			window.requestAnimationFrame(update);
		}
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		update();
	}

	/* ======================================================================
	   2) "First unread" button
	   Forumotion marks unread posts with an "unread" post icon in the post
	   header; phpBB-style pages may also have an #unread anchor.
	   ====================================================================== */
	function firstUnread() {
		var target = null;
		var icons = document.querySelectorAll('.fm-post-meta img');
		for (var i = 0; i < icons.length; i++) {
			var c = (icons[i].className || '') + ' ' + (icons[i].getAttribute('src') || '');
			if (/unread|_new/i.test(c)) {
				target = icons[i].closest('.post');
				break;
			}
		}
		if (!target) target = document.getElementById('unread') || document.querySelector('a[name="unread"]');
		if (!target) return;

		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'fm-jump-unread';
		btn.innerHTML = '<span class="fm-ju-ico" aria-hidden="true"></span><span>First unread</span>';
		document.body.appendChild(btn);

		btn.addEventListener('click', function () {
			var top = target.getBoundingClientRect().top + window.pageYOffset - 70;
			window.scrollTo({ top: top, behavior: on('fm-pref-motion') ? 'auto' : 'smooth' });
		});

		/* only visible while the first unread post is further down the page */
		function check() {
			var r = target.getBoundingClientRect();
			btn.classList.toggle('is-visible', r.top > window.innerHeight * 0.6);
		}
		window.addEventListener('scroll', check, { passive: true });
		window.addEventListener('resize', check);
		check();
	}

	/* ======================================================================
	   3) Fold long quotes
	   ====================================================================== */
	var QUOTE_MAX = 200; /* px; taller quotes get folded */

	function foldQuotes() {
		var quotes = document.querySelectorAll('.fm-post-content blockquote, .fm-pm-read .content blockquote, .fm-sr-post .content blockquote');
		for (var i = 0; i < quotes.length; i++) {
			var q = quotes[i];
			if (q.parentNode.closest && q.parentNode.closest('blockquote')) continue; /* only outer quotes */
			if (q.getAttribute('data-fm-fold')) continue;
			if (q.scrollHeight <= QUOTE_MAX + 60) continue;
			q.setAttribute('data-fm-fold', '1');
			q.classList.add('fm-quote-long', 'is-folded');
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'fm-quote-more';
			b.textContent = 'Show more';
			q.appendChild(b);
		}
	}

	function quoteClicks() {
		/* capture phase on window: other scripts can't swallow the click */
		window.addEventListener('click', function (e) {
			var b = e.target.closest && e.target.closest('.fm-quote-more');
			if (!b) return;
			e.preventDefault();
			var q = b.parentNode;
			var folded = q.classList.toggle('is-folded');
			b.textContent = folded ? 'Show more' : 'Show less';
		}, true);
	}

	/* ======================================================================
	   4) Image lightbox
	   ====================================================================== */
	function lightbox() {
		var box = null;

		function close() {
			if (!box) return;
			box.classList.remove('is-open');
			document.documentElement.classList.remove('fm-lb-open');
		}

		function open(src, alt) {
			if (!box) {
				box = document.createElement('div');
				box.className = 'fm-lightbox';
				box.setAttribute('role', 'dialog');
				box.setAttribute('aria-modal', 'true');
				box.innerHTML = '<img alt="" /><a class="fm-lb-orig" target="_blank" rel="noopener">Open original</a><button type="button" class="fm-lb-close" aria-label="Close"></button>';
				document.body.appendChild(box);
				box.addEventListener('click', function (e) {
					if (e.target.classList.contains('fm-lb-orig')) return;
					close();
				});
			}
			var img = box.querySelector('img');
			img.src = src;
			img.alt = alt || '';
			box.querySelector('.fm-lb-orig').href = src;
			box.classList.add('is-open');
			document.documentElement.classList.add('fm-lb-open');
		}

		window.addEventListener('click', function (e) {
			var img = e.target;
			if (!img || img.tagName !== 'IMG') return;
			if (!img.closest('.fm-post-content, .fm-pm-read .content, #preview .content, .fm-sr-post .content')) return;
			if (img.closest('a')) return;                 /* linked images keep their link */
			if ((img.naturalWidth || 0) < 160) return;    /* smilies and small icons */
			e.preventDefault();
			open(img.currentSrc || img.src, img.alt);
		}, true);

		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' || e.keyCode === 27) close();
		});

		/* mark the images that can be opened (cursor) */
		function markImages() {
			var imgs = document.querySelectorAll('.fm-post-content img, .fm-pm-read .content img');
			for (var i = 0; i < imgs.length; i++) {
				var im = imgs[i];
				if (im.closest('a')) continue;
				if (im.complete) {
					if (im.naturalWidth >= 160) im.classList.add('fm-zoomable');
				} else {
					im.addEventListener('load', function () {
						if (this.naturalWidth >= 160) this.classList.add('fm-zoomable');
					});
				}
			}
		}
		markImages();
	}

	/* ======================================================================
	   5) "N new" badge on index categories
	   ====================================================================== */
	function categoryBadges() {
		var cats = document.querySelectorAll('.forabg.fm-cat');
		for (var i = 0; i < cats.length; i++) {
			var n = cats[i].querySelectorAll('ul.fm-forums li.row dl.fm-forum[style*="unread"]').length;
			var title = cats[i].querySelector('.table-title');
			if (!title || title.querySelector('.fm-cat-new')) continue;
			if (n > 0) {
				var s = document.createElement('span');
				s.className = 'fm-cat-new';
				s.textContent = n + ' new';
				s.title = n + (n === 1 ? ' forum has' : ' forums have') + ' new posts';
				title.appendChild(s);
			}
		}
	}

	/* ======================================================================
	   6) Relative dates
	   Understands: "Today at 10:20 pm", "Yesterday at 22:20",
	   "10/11/2026, 10:20 pm" (day/month/year), "2026-11-10, 22:20",
	   "Tue 10 Nov 2026 - 22:20". Anything else is left as it is.
	   Dates older than a week stay as they are too.
	   ====================================================================== */
	var DATE_ORDER = 'dmy'; /* change to 'mdy' if the forum shows month/day/year */
	var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
	var DATE_RX = /(Today|Yesterday)\s+at\s+\d{1,2}:\d{2}(?:\s*[ap]m)?|\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]m)?|\d{4}-\d{2}-\d{2},?\s+\d{1,2}:\d{2}(?:\s*[ap]m)?|(?:[A-Z][a-z]{2}\s+)?\d{1,2}\s+[A-Z][a-z]{2}(?:\s+\d{4})?\s+-\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?/i;

	function hm(h, m, ap) {
		h = parseInt(h, 10);
		m = parseInt(m, 10);
		if (ap) {
			ap = ap.toLowerCase();
			if (ap === 'pm' && h < 12) h += 12;
			if (ap === 'am' && h === 12) h = 0;
		}
		return [h, m];
	}

	function parseDate(s) {
		var now = new Date();
		var m, t, d;
		if ((m = /(Today|Yesterday)\s+at\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?/i.exec(s))) {
			t = hm(m[2], m[3], m[4]);
			d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t[0], t[1]);
			if (/yesterday/i.test(m[1])) d.setDate(d.getDate() - 1);
			return d;
		}
		if ((m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?/i.exec(s))) {
			var y = parseInt(m[3], 10);
			if (y < 100) y += 2000;
			var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
			var day = DATE_ORDER === 'dmy' ? a : b;
			var mon = DATE_ORDER === 'dmy' ? b : a;
			t = hm(m[4], m[5], m[6]);
			return new Date(y, mon - 1, day, t[0], t[1]);
		}
		if ((m = /(\d{4})-(\d{2})-(\d{2}),?\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?/i.exec(s))) {
			t = hm(m[4], m[5], m[6]);
			return new Date(+m[1], +m[2] - 1, +m[3], t[0], t[1]);
		}
		if ((m = /(\d{1,2})\s+([A-Z][a-z]{2})(?:\s+(\d{4}))?\s+-\s+(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap]m))?/i.exec(s))) {
			var mo = MONTHS[m[2].toLowerCase()];
			if (mo === undefined) return null;
			t = hm(m[4], m[5], m[6]);
			return new Date(m[3] ? +m[3] : now.getFullYear(), mo, +m[1], t[0], t[1]);
		}
		return null;
	}

	function relative(d) {
		var diff = (Date.now() - d.getTime()) / 1000;
		if (diff < -60 || diff > 7 * 86400) return null; /* future or older than a week */
		if (diff < 60) return 'just now';
		if (diff < 3600) {
			var mi = Math.floor(diff / 60);
			return mi + (mi === 1 ? ' minute ago' : ' minutes ago');
		}
		if (diff < 86400) {
			var h = Math.floor(diff / 3600);
			return h + (h === 1 ? ' hour ago' : ' hours ago');
		}
		var today = new Date();
		today.setHours(0, 0, 0, 0);
		var days = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
		if (days <= 1) return 'yesterday';
		return days + ' days ago';
	}

	var DATE_SCOPES = '.fm-post-meta, .fm-tlp-info, .fm-lp-info, .fm-pm-meta, .fm-sr-meta, .fm-tlastpost, .fm-lastpost';

	function wrapDates() {
		var scopes = document.querySelectorAll(DATE_SCOPES);
		for (var i = 0; i < scopes.length; i++) {
			var walker = document.createTreeWalker(scopes[i], NodeFilter.SHOW_TEXT, null, false);
			var nodes = [];
			var n;
			while ((n = walker.nextNode())) {
				if (n.parentNode && n.parentNode.classList && n.parentNode.classList.contains('fm-date')) continue;
				if (DATE_RX.test(n.nodeValue)) nodes.push(n);
			}
			for (var j = 0; j < nodes.length; j++) {
				var node = nodes[j];
				var m = DATE_RX.exec(node.nodeValue);
				if (!m) continue;
				var d = parseDate(m[0]);
				if (!d || isNaN(d.getTime())) continue;
				var after = node.splitText(m.index);
				after.splitText(m[0].length);
				var span = document.createElement('time');
				span.className = 'fm-date';
				span.setAttribute('datetime', d.toISOString());
				span.setAttribute('data-abs', m[0]);
				span.title = m[0];
				span.textContent = m[0];
				after.parentNode.replaceChild(span, after);
			}
		}
		refreshDates();
	}

	function refreshDates() {
		var use = on('fm-pref-reldate');
		var all = document.querySelectorAll('time.fm-date');
		for (var i = 0; i < all.length; i++) {
			var abs = all[i].getAttribute('data-abs');
			var rel = use ? relative(new Date(all[i].getAttribute('datetime'))) : null;
			all[i].textContent = rel || abs;
			all[i].classList.toggle('is-relative', !!rel);
		}
	}

	/* ======================================================================
	   7) Topic preview on hover (mouse only)
	   ====================================================================== */
	function topicPreview() {
		if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
		if (!window.fetch || !window.DOMParser) return;

		var cache = {};
		var card = null;
		var timer = null;
		var current = null;

		function getCard() {
			if (!card) {
				card = document.createElement('div');
				card.className = 'fm-tpreview';
				card.setAttribute('role', 'tooltip');
				document.body.appendChild(card);
			}
			return card;
		}

		/* the browser's own tooltip (title="...") would cover the card:
		   park the title while the mouse is on the link, put it back after */
		var parked = [];

		/* the link and everything up to its row (the row often carries
		   title="No new posts" from Forumotion) */
		function parkTitle(link) {
			var el = link;
			var stop = link.closest('li.row, tr, .fm-topic') || link.parentNode;
			while (el && el !== document.body) {
				var t = el.getAttribute && el.getAttribute('title');
				if (t !== null && t !== undefined) {
					el.setAttribute('data-fm-title', t);
					el.removeAttribute('title');
					parked.push(el);
				}
				if (el === stop) break;
				el = el.parentNode;
			}
		}

		function restoreTitle() {
			while (parked.length) {
				var el = parked.pop();
				el.setAttribute('title', el.getAttribute('data-fm-title'));
				el.removeAttribute('data-fm-title');
			}
		}

		function hide() {
			clearTimeout(timer);
			restoreTitle();
			current = null;
			if (card) card.classList.remove('is-open');
		}

		function place(link) {
			var c = getCard();
			var r = link.getBoundingClientRect();
			var top = r.bottom + window.pageYOffset + 8;
			var left = Math.min(r.left + window.pageXOffset, window.pageXOffset + document.documentElement.clientWidth - 380);
			c.style.top = top + 'px';
			c.style.left = Math.max(8, left) + 'px';
		}

		function show(link, data) {
			if (current !== link) return;
			var c = getCard();
			c.innerHTML = '';
			if (!data) {
				c.innerHTML = '<p class="fm-tp-text fm-tp-empty">No preview available.</p>';
			} else {
				var h = document.createElement('div');
				h.className = 'fm-tp-head';
				h.textContent = data.author ? data.author : '';
				var p = document.createElement('p');
				p.className = 'fm-tp-text';
				p.textContent = data.text;
				if (data.author) c.appendChild(h);
				c.appendChild(p);
			}
			place(link);
			c.classList.add('is-open');
		}

		function extract(html) {
			var doc = new DOMParser().parseFromString(html, 'text/html');
			var post = doc.querySelector('.post.fm-post, .post');
			if (!post) return null;
			var content = post.querySelector('.fm-post-content, .content');
			if (!content) return null;
			var clone = content.cloneNode(true);
			/* drop quotes, code and scripts from the preview */
			var junk = clone.querySelectorAll('blockquote, dl.codebox, script, style, .fm-copy-btn');
			for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
			var text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
			if (!text) return null;
			if (text.length > 280) text = text.slice(0, 277).replace(/\s+\S*$/, '') + '\u2026';
			var name = post.querySelector('.fm-pp-name, .postprofile dt strong, .fm-post-meta a');
			return { text: text, author: name ? name.textContent.replace(/\s+/g, ' ').trim() : '' };
		}

		function load(link) {
			var url = link.href.split('#')[0];
			if (cache.hasOwnProperty(url)) {
				show(link, cache[url]);
				return;
			}
			fetch(url, { credentials: 'same-origin' })
				.then(function (r) { return r.ok ? r.text() : ''; })
				.then(function (html) {
					cache[url] = html ? extract(html) : null;
					show(link, cache[url]);
				})
				.catch(function () {
					cache[url] = null;
				});
		}

		document.addEventListener('mouseover', function (e) {
			if (!on('fm-pref-preview')) return;
			var link = e.target.closest && e.target.closest('.fm-topics a.topictitle, .fm-sr-topics a.topictitle');
			if (!link || link === current) return;
			if (link.host !== location.host) return;
			hide();
			current = link;
			parkTitle(link);
			timer = setTimeout(function () { load(link); }, 450);
		});

		document.addEventListener('mouseout', function (e) {
			var link = e.target.closest && e.target.closest('a.topictitle');
			if (link && link === current && !link.contains(e.relatedTarget)) hide();
		});

		window.addEventListener('scroll', hide, { passive: true });
	}

	/* ======================================================================
	   8) Mark your own posts
	   Forumotion gives the logged-in member's id in _userdata.
	   ====================================================================== */
	function ownPosts() {
		var ud = window._userdata;
		if (!ud || !ud.user_id || +ud.user_id < 1 || +ud.session_logged_in === 0) return;
		var id = String(ud.user_id);
		var rx = new RegExp('^/u' + id + '(?:\\D|$)');
		var posts = document.querySelectorAll('.post.fm-post');
		for (var i = 0; i < posts.length; i++) {
			var a = posts[i].querySelector('.fm-post-profile a[href^="/u"], .fm-pp-name a[href^="/u"], .fm-post-meta a[href^="/u"]');
			if (!a) continue;
			var path = a.getAttribute('href').replace(/^https?:\/\/[^/]+/, '');
			if (rx.test(path)) posts[i].classList.add('fm-post-own');
		}
	}


	/* ======================================================================
	   9) Writing helpers
	   Forumotion's editor (SCEditor) keeps the real text in its own object;
	   the textarea only updates when the form is sent.
	   ====================================================================== */

	function editorBox() {
		return document.getElementById('text_editor_textarea');
	}

	function editor() {
		var ta = editorBox();
		if (!ta || !window.jQuery) return null;
		try {
			var inst = window.jQuery(ta).sceditor('instance');
			return inst && typeof inst.val === 'function' ? inst : null;
		} catch (e) {
			return null;
		}
	}

	function editorText() {
		var inst = editor();
		if (inst) {
			try { return inst.val() || ''; } catch (e) { /* fall through */ }
		}
		var ta = editorBox();
		return ta ? ta.value : '';
	}

	function insertText(text) {
		var inst = editor();
		if (inst) {
			try {
				if (inst.inSourceMode && inst.inSourceMode()) {
					inst.insertText(text);
				} else {
					inst.insert(text);
				}
				inst.focus();
				return true;
			} catch (e) { /* fall through */ }
		}
		var ta = editorBox();
		if (!ta) return false;
		ta.value += text;
		ta.focus();
		return true;
	}

	/* run fn once the editor exists (it is built after the page loads) */
	function whenEditor(fn) {
		var tries = 0;
		(function wait() {
			if (editor() || tries > 40) {
				fn(editor());
				return;
			}
			tries++;
			setTimeout(wait, 250);
		})();
	}

	/* --- word & character count --- */

	function plainText(bb) {
		return bb
			.replace(/\[(?:code|img|youtube|dailymotion|flash|url)[^\]]*\][\s\S]*?\[\/(?:code|img|youtube|dailymotion|flash|url)\]/gi, function (m) {
				/* keep the text of links and code, drop image / video addresses */
				return /^\[(code|url)/i.test(m) ? m.replace(/\[[^\]]*\]/g, '') : ' ';
			})
			.replace(/\[\/?[a-z*][^\]]*\]/gi, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function wordCount() {
		var ta = editorBox();
		if (!ta || document.querySelector('.fm-wcount')) return;
		var box = document.createElement('div');
		box.className = 'fm-wcount';
		box.setAttribute('aria-live', 'polite');
		box.innerHTML = '<span class="fm-wc-words">0 words</span><span class="fm-wc-chars">0 characters</span>';
		var wrap = ta.parentNode;
		wrap.appendChild(box);
		var words = box.firstChild, chars = box.lastChild;
		var queued = false;

		function count() {
			queued = false;
			var txt = plainText(editorText());
			var w = txt ? txt.split(' ').length : 0;
			var c = txt.length;
			words.textContent = w + (w === 1 ? ' word' : ' words');
			chars.textContent = c + (c === 1 ? ' character' : ' characters');
		}
		function later() {
			if (queued) return;
			queued = true;
			setTimeout(count, 150);
		}

		whenEditor(function (inst) {
			count();
			if (inst && inst.bind) {
				try { inst.bind('keyup blur nodechanged valuechanged', later); } catch (e) { /* old editor */ }
			}
			/* toolbar buttons, smilies, source mode, pasting */
			wrap.addEventListener('click', later, true);
			wrap.addEventListener('input', later, true);
			wrap.addEventListener('keyup', later, true);
			wrap.addEventListener('paste', function () { setTimeout(later, 0); }, true);
			window.addEventListener('fm:inserted', later);
		});
	}

	/* --- warning before leaving with an unsent message --- */

	function leaveWarning() {
		var ta = editorBox();
		if (!ta) return;
		var form = ta.form || ta.closest('form');
		var sending = false;
		var start = null;

		whenEditor(function () {
			start = editorText();
		});

		if (form) {
			form.addEventListener('submit', function () { sending = true; }, true);
			/* buttons that send the form (post, preview, draft) */
			form.addEventListener('click', function (e) {
				var b = e.target.closest && e.target.closest('input[type="submit"], button[type="submit"], button:not([type])');
				if (b && form.contains(b)) {
					sending = true;
					setTimeout(function () { sending = false; }, 4000);
				}
			}, true);
		}

		window.addEventListener('beforeunload', function (e) {
			if (sending || start === null) return;
			var now = editorText();
			if (!now.trim() || now === start) return;
			e.preventDefault();
			e.returnValue = '';
			return '';
		});
	}

	/* --- "Quote" on selected text in a post --- */

	var QUOTE_KEY = 'fmQuoteDraft';

	function quoteSelection() {
		if (!document.querySelector('.post.fm-post')) return;
		var btn = null, pending = null;

		function hideBtn() {
			if (btn) btn.classList.remove('is-open');
			pending = null;
		}

		function getBtn() {
			if (btn) return btn;
			btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'fm-quote-sel';
			btn.innerHTML = '<span class="fm-qs-ico" aria-hidden="true"></span>Quote';
			/* keep the selection when the button is pressed */
			btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
			document.body.appendChild(btn);
			return btn;
		}

		function author(post) {
			var n = post.querySelector('.fm-pp-name');
			var name = n ? n.textContent : '';
			if (!name) {
				var a = post.querySelector('.fm-post-meta a[href^="/u"]');
				name = a ? a.textContent : '';
			}
			return name.replace(/\s+/g, ' ').replace(/"/g, '').trim();
		}

		function check() {
			var sel = window.getSelection ? window.getSelection() : null;
			if (!sel || sel.isCollapsed || !sel.rangeCount) {
				hideBtn();
				return;
			}
			var range = sel.getRangeAt(0);
			var start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentNode;
			var end = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentNode;
			var content = start.closest && start.closest('.fm-post-content');
			if (!content || !content.contains(end)) {
				hideBtn();
				return;
			}
			var text = sel.toString().replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
			if (text.length < 2) {
				hideBtn();
				return;
			}
			var post = content.closest('.post.fm-post');
			pending = { text: text, name: post ? author(post) : '' };

			var rects = range.getClientRects();
			var r = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
			var b = getBtn();
			b.classList.add('is-open');
			var bw = b.offsetWidth || 90;
			var left = Math.min(window.innerWidth - bw - 8, Math.max(8, r.right - bw / 2));
			b.style.left = (left + window.pageXOffset) + 'px';
			b.style.top = (r.bottom + window.pageYOffset + 8) + 'px';
		}

		document.addEventListener('mouseup', function (e) {
			if (btn && btn.contains(e.target)) return;
			setTimeout(check, 10);
		});
		document.addEventListener('keyup', function (e) {
			if (e.shiftKey || e.key === 'Shift') setTimeout(check, 10);
		});
		document.addEventListener('touchend', function () { setTimeout(check, 300); });
		document.addEventListener('mousedown', function (e) {
			if (btn && !btn.contains(e.target)) hideBtn();
		});
		window.addEventListener('scroll', function () {
			/* the button scrolls with the page; nothing to do */
		}, { passive: true });

		window.addEventListener('click', function (e) {
			if (!btn || !btn.contains(e.target) || !pending) return;
			e.preventDefault();
			var bb = '[quote' + (pending.name ? '="' + pending.name + '"' : '') + ']' + pending.text + '[/quote]\n';
			hideBtn();
			if (window.getSelection) window.getSelection().removeAllRanges();

			/* quick reply on the page: put it there */
			var qr = document.querySelector('.fm-quickreply #text_editor_textarea, #quick_reply #text_editor_textarea');
			if (qr && insertText(bb)) {
				var area = qr.closest('.fm-quickreply') || qr.closest('form') || qr;
				area.scrollIntoView({ behavior: on('fm-pref-motion') ? 'auto' : 'smooth', block: 'center' });
				window.dispatchEvent(new Event('fm:inserted'));
				return;
			}

			/* otherwise open the reply page with the quote waiting */
			var link = document.querySelector('a.fm-btn-reply[href*="mode=reply"], a[href*="mode=reply"]');
			if (!link) return;
			try { window.sessionStorage.setItem(QUOTE_KEY, bb); } catch (err) { /* blocked */ }
			window.location.href = link.href;
		}, true);
	}

	/* on the reply page: add the quote saved by quoteSelection() */
	function quoteDraft() {
		var bb = null;
		try { bb = window.sessionStorage.getItem(QUOTE_KEY); } catch (e) { return; }
		if (!bb || !editorBox()) return;
		try { window.sessionStorage.removeItem(QUOTE_KEY); } catch (e) { /* blocked */ }
		whenEditor(function () {
			insertText(bb);
			window.dispatchEvent(new Event('fm:inserted'));
		});
	}

	/* ======================================================================
	   10) Levels & badges
	   Experience (XP) comes from the "Posts" and "Reputation" profile fields
	   shown next to posts (Admin Panel > Users & Groups > Profiles > Profile
	   fields: they must be visible "in messages"), and badges also use
	   "Join date". The labels below must match your forum's labels.
	   ====================================================================== */

	var LV = {
		labels: {
			posts: ['posts', 'messages'],
			rep: ['reputation'],
			joined: ['join date', 'joined', 'registered']
		},
		xpPerPost: 10,
		xpPerRep: 15,
		/* XP needed for level L is STEP x (L - 1)^2 : level 5 = 40 posts,
		   level 10 = 203 posts, level 20 = 903 posts, level 30 = 2103 posts */
		step: 25,
		maxLevel: 99,
		tiers: [
			{ from: 1, name: 'Newcomer', key: 'sprout' },
			{ from: 5, name: 'Regular', key: 'bronze' },
			{ from: 10, name: 'Veteran', key: 'silver' },
			{ from: 20, name: 'Elite', key: 'gold' },
			{ from: 30, name: 'Master', key: 'emerald' },
			{ from: 45, name: 'Champion', key: 'amethyst' },
			{ from: 60, name: 'Legend', key: 'ruby' }
		],
		/* badges: one per group (the best one earned) */
		badges: {
			posts: [
				{ min: 5000, name: 'Living legend', text: '5000+ posts', icon: 'crown' },
				{ min: 1000, name: 'Pillar of the forum', text: '1000+ posts', icon: 'trophy' },
				{ min: 500, name: 'Storyteller', text: '500+ posts', icon: 'quote' },
				{ min: 100, name: 'Chatterbox', text: '100+ posts', icon: 'bubble' },
				{ min: 10, name: 'First steps', text: '10+ posts', icon: 'pen' }
			],
			rep: [
				{ min: 100, name: 'Adored', text: '100+ reputation', icon: 'heart2' },
				{ min: 25, name: 'Well liked', text: '25+ reputation', icon: 'heart' }
			]
		}
	};

	function levelFor(xp) {
		var l = Math.floor(1 + Math.sqrt(Math.max(0, xp) / LV.step));
		return Math.min(LV.maxLevel, l);
	}

	function xpFor(level) {
		return LV.step * (level - 1) * (level - 1);
	}

	function tierFor(level) {
		var t = LV.tiers[0];
		for (var i = 0; i < LV.tiers.length; i++) if (level >= LV.tiers[i].from) t = LV.tiers[i];
		return t;
	}

	function num(s) {
		var m = /-?[\d.,\s]+/.exec(s || '');
		if (!m) return null;
		var n = parseInt(m[0].replace(/[^\d-]/g, ''), 10);
		return isNaN(n) ? null : n;
	}

	function day(s) {
		if (!s) return null;
		var m;
		if ((m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return new Date(+m[1], +m[2] - 1, +m[3]);
		if ((m = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/.exec(s))) {
			var a = +m[1], b = +m[2];
			return DATE_ORDER === 'dmy' ? new Date(+m[3], b - 1, a) : new Date(+m[3], a - 1, b);
		}
		if ((m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(s)) && MONTHS[m[2].toLowerCase()] !== undefined) {
			return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
		}
		if ((m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)) && MONTHS[m[1].toLowerCase()] !== undefined) {
			return new Date(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
		}
		return null;
	}

	function labelKey(label) {
		var l = label.toLowerCase().replace(/[:\s]+$/, '').replace(/\s+/g, ' ').trim();
		for (var k in LV.labels) {
			if (LV.labels.hasOwnProperty(k) && LV.labels[k].indexOf(l) !== -1) return k;
		}
		return null;
	}

	/* value of a field: a "3 days ago" date keeps the real date in data-abs */
	function fieldValue(nodes) {
		var out = '';
		for (var i = 0; i < nodes.length; i++) {
			var n = nodes[i];
			if (n.nodeType === 1) {
				var abs = n.matches && n.matches('time.fm-date') ? n.getAttribute('data-abs') : null;
				if (!abs && n.querySelector) {
					var t = n.querySelector('time.fm-date');
					if (t) abs = t.getAttribute('data-abs');
				}
				out += abs || n.textContent;
			} else {
				out += n.nodeValue;
			}
		}
		return out.replace(/\u00a0/g, ' ').trim();
	}

	/* fields next to a post: <span class="label">Posts : </span> 145<br> */
	function postStats(post) {
		var dd = post.querySelector('.fm-pp-fields');
		if (!dd) return null;
		var stats = {};
		var labels = dd.querySelectorAll('.label');
		for (var i = 0; i < labels.length; i++) {
			var key = labelKey(labels[i].textContent);
			if (!key) continue;
			var nodes = [];
			var n = labels[i].nextSibling;
			while (n && !(n.nodeType === 1 && (n.tagName === 'BR' || n.classList.contains('label')))) {
				nodes.push(n);
				n = n.nextSibling;
			}
			stats[key] = fieldValue(nodes);
		}
		return stats;
	}

	/* fields on the profile page: <dl><dt>Posts :</dt><dd>145</dd></dl>
	   or on the statistics tab: <li><label>Total posts :</label> 145 (2%)</li> */
	function profileStats() {
		var stats = {};
		var dls = document.querySelectorAll('#profile-tab-field-profil dl');
		for (var i = 0; i < dls.length; i++) {
			var dt = dls[i].querySelector('dt'), dd = dls[i].querySelector('dd');
			if (!dt || !dd) continue;
			var key = labelKey(dt.textContent);
			if (key) stats[key] = fieldValue([dd]);
		}
		var lis = document.querySelectorAll('#profile-advanced-details .stats-field li');
		for (var j = 0; j < lis.length; j++) {
			var lab = lis[j].querySelector('label');
			if (!lab) continue;
			var l = lab.textContent.toLowerCase();
			var rest = fieldValue([].slice.call(lis[j].childNodes).filter(function (c) { return c !== lab; }));
			if (!stats.posts && /total posts|total messages/.test(l)) stats.posts = rest;
			if (!stats.joined && /joined|join date|registered/.test(l)) stats.joined = rest;
		}
		return stats;
	}

	function compute(stats) {
		var posts = num(stats.posts);
		if (posts === null) return null;
		var rep = num(stats.rep) || 0;
		var joined = day(stats.joined);
		var xp = posts * LV.xpPerPost + Math.max(0, rep) * LV.xpPerRep;
		var level = levelFor(xp);
		var lo = xpFor(level), hi = xpFor(level + 1);
		return {
			posts: posts,
			rep: rep,
			joined: joined,
			xp: xp,
			level: level,
			tier: tierFor(level),
			next: level >= LV.maxLevel ? 0 : hi - xp,
			progress: level >= LV.maxLevel ? 1 : (xp - lo) / (hi - lo)
		};
	}

	function badgesFor(d) {
		var out = [];
		var now = new Date();
		var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		for (var g in LV.badges) {
			if (!LV.badges.hasOwnProperty(g)) continue;
			var value = g === 'posts' ? d.posts : d.rep;
			for (var i = 0; i < LV.badges[g].length; i++) {
				if (value >= LV.badges[g][i].min) {
					out.push({ name: LV.badges[g][i].name, text: LV.badges[g][i].text, icon: LV.badges[g][i].icon });
					break;
				}
			}
		}

		if (d.joined) {
			var days = Math.floor((today - d.joined) / 86400000);
			var years = now.getFullYear() - d.joined.getFullYear();
			if (now.getMonth() < d.joined.getMonth() ||
				(now.getMonth() === d.joined.getMonth() && now.getDate() < d.joined.getDate())) years--;

			if (years >= 1 && now.getMonth() === d.joined.getMonth() && now.getDate() === d.joined.getDate()) {
				out.unshift({ name: 'Forum birthday!', text: years + (years === 1 ? ' year' : ' years') + ' here today', icon: 'cake', special: true });
			}
			if (years >= 1) {
				out.push({ name: years + (years === 1 ? ' year' : ' years') + ' with us', text: 'Member since ' + d.joined.getFullYear(), icon: 'years', value: years });
			} else if (days >= 0 && days < 30) {
				out.push({ name: 'New here', text: 'Joined less than a month ago', icon: 'sprout' });
			}
			if (days >= 30 && d.posts / days >= 3) {
				out.push({ name: 'On fire', text: 'More than 3 posts a day', icon: 'flame' });
			}
		}
		return out;
	}

	function esc(s) {
		return String(s).replace(/[&<>"]/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
		});
	}

	function fmt(n) {
		return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	function badgeHTML(list, big) {
		var h = '';
		for (var i = 0; i < list.length; i++) {
			var b = list[i];
			var tip = esc(b.name + ' \u2014 ' + b.text);
			h += '<span class="fm-badge fm-badge-' + b.icon + (b.special ? ' is-special' : '') + '" tabindex="0" role="img" aria-label="' + tip + '" data-tip="' + tip + '">' +
				(b.value ? '<b>' + b.value + '</b>' : '<i aria-hidden="true"></i>') +
				(big ? '<span class="fm-badge-name">' + esc(b.name) + '<small>' + esc(b.text) + '</small></span>' : '') +
				'</span>';
		}
		return h;
	}

	function ring(target, d) {
		if (!target || !target.querySelector('img') || target.querySelector('.fm-lvl-ring')) return;
		var r = document.createElement('span');
		r.className = 'fm-lvl-ring';
		r.setAttribute('aria-hidden', 'true');
		r.style.setProperty('--fm-lvl-p', (d.progress * 100).toFixed(1) + '%');
		var chip = document.createElement('span');
		chip.className = 'fm-lvl-chip';
		chip.setAttribute('aria-hidden', 'true');
		chip.textContent = d.level;
		target.appendChild(r);
		target.appendChild(chip);
	}

	function xpBar(d, big) {
		var tip = fmt(d.xp) + ' XP' + (d.next ? ' \u2014 ' + fmt(d.next) + ' XP to level ' + (d.level + 1) : ' \u2014 top level');
		return '<span class="fm-lvl-head"><span class="fm-lvl-tier">' + esc(d.tier.name) + '</span>' +
			'<span class="fm-lvl-num">Lv ' + d.level + '</span></span>' +
			'<span class="fm-lvl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
			Math.round(d.progress * 100) + '" aria-label="' + esc(tip) + '" title="' + esc(tip) + '">' +
			'<span style="width:' + (d.progress * 100).toFixed(1) + '%"></span></span>' +
			(big ? '<span class="fm-lvl-xp">' + esc(tip) + '</span>' : '');
	}

	function levels() {
		/* posts in topics (and in private messages, where the fields show) */
		var posts = document.querySelectorAll('.post.fm-post');
		for (var i = 0; i < posts.length; i++) {
			var post = posts[i];
			if (post.querySelector('.fm-lvl')) continue;
			var stats = postStats(post);
			var d = stats && compute(stats);
			if (!d) continue;
			var prof = post.querySelector('.fm-post-profile dl') || post.querySelector('.fm-post-profile');
			if (!prof) continue;
			post.classList.add('fm-lvl-' + d.tier.key);

			ring(post.querySelector('.fm-pp-avatar'), d);

			var box = document.createElement('dd');
			box.className = 'fm-lvl fm-lvl-' + d.tier.key;
			var b = badgesFor(d);
			box.innerHTML = xpBar(d, false) + (b.length ? '<span class="fm-badges">' + badgeHTML(b, false) + '</span>' : '');
			var rank = prof.querySelector('.fm-pp-rank');
			if (rank && rank.parentNode === prof) {
				prof.insertBefore(box, rank.nextSibling);
			} else {
				prof.appendChild(box);
			}
		}

		/* profile page: a level card under the avatar */
		var card = document.querySelector('.fm-pcard .fm-pcard-body');
		if (card && !card.querySelector('.fm-lvl')) {
			var pd = compute(profileStats());
			if (pd) {
				card.classList.add('fm-lvl-' + pd.tier.key);
				var img = card.querySelector('img');
				if (img) {
					var holder = document.createElement('span');
					holder.className = 'fm-lvl-avatar';
					img.parentNode.insertBefore(holder, img);
					holder.appendChild(img);
					ring(holder, pd);
				}
				var pb = badgesFor(pd);
				var c = document.createElement('div');
				c.className = 'fm-lvl fm-lvl-card fm-lvl-' + pd.tier.key;
				c.innerHTML = xpBar(pd, true) + (pb.length ? '<span class="fm-badges fm-badges-big">' + badgeHTML(pb, true) + '</span>' : '');
				card.appendChild(c);
			}
		}
	}


	/* ======================================================================
	   11) Private messages as conversations
	   On the inbox (and sent / outbox), every page of the folder is read
	   in the background (pages come from the "Page 1 of 5" pagination),
	   plus the other folders so your own replies show up too. Messages
	   with the same subject (without "Re:") and the same other person
	   become one conversation. Clicking it loads its messages in order.
	   A switch above the list goes back to the normal list.
	   ====================================================================== */

	var PMC = {
		modeKey: 'fmPmGroup',
		cacheKey: 'fmPmCache',
		cacheTime: 60000,  /* folder lists are kept for 1 minute */
		maxPages: 15,      /* pages read per folder, at most */
		perLoad: 15,       /* messages shown at once in a conversation */
		together: 3        /* pages loaded at the same time */
	};

	/* folders read together with the one being viewed */
	var PM_ALSO = {
		inbox: ['sentbox', 'outbox'],
		sentbox: ['inbox', 'outbox'],
		outbox: ['inbox', 'sentbox'],
		savebox: []
	};

	function pmFolder(url) {
		var m = /[?&]folder=([a-z]+)/i.exec(url || window.location.search);
		return m ? m[1].toLowerCase() : 'inbox';
	}

	function pmSubject(s) {
		return s.replace(/\u00a0/g, ' ')
			.replace(/^\s*(?:(?:re|fw|fwd)\s*(?:\[\d+\])?\s*:\s*)+/i, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function getDoc(url) {
		return fetch(url, { credentials: 'same-origin' })
			.then(function (r) {
				if (!r.ok) throw new Error('HTTP ' + r.status);
				return r.text();
			})
			.then(function (html) {
				return new DOMParser().parseFromString(html, 'text/html');
			});
	}

	/* run fn over items, n at a time; failed items give null */
	function pool(items, n, fn) {
		var out = new Array(items.length), next = 0;
		function run() {
			if (next >= items.length) return Promise.resolve();
			var k = next++;
			return fn(items[k]).then(function (v) { out[k] = v; }, function () { out[k] = null; }).then(run);
		}
		var workers = [];
		for (var i = 0; i < Math.min(n, items.length); i++) workers.push(run());
		return Promise.all(workers).then(function () { return out; });
	}

	function mkTime(ms, abs) {
		var t = document.createElement('time');
		t.className = 'fm-date';
		if (ms) t.setAttribute('datetime', new Date(ms).toISOString());
		t.setAttribute('data-abs', abs || '');
		t.title = abs || '';
		var rel = ms && on('fm-pref-reldate') ? relative(new Date(ms)) : null;
		t.textContent = rel || abs || '';
		if (rel) t.classList.add('is-relative');
		return t;
	}

	/* the rows of one list page */
	function pmRows(doc, folder) {
		var out = [];
		var rows = doc.querySelectorAll('ul.pmlist li.row');
		for (var i = 0; i < rows.length; i++) {
			var li = rows[i];
			if (li.classList.contains('fm-pm-empty') || li.classList.contains('fm-pmc')) continue;
			var a = li.querySelector('dt a.topictitle') || li.querySelector('dt a[href*="mode=read"]');
			if (!a) continue;
			var box = li.querySelector('input[type="checkbox"]');
			var href = a.getAttribute('href') || '';
			var id = box ? box.value : ((/[?&]p=(\d+)/.exec(href) || [])[1] || '');
			var dl = li.querySelector('dl.icon');
			var style = (dl && dl.getAttribute('style')) || '';
			var meta = li.querySelector('.fm-pm-meta') || li.querySelector('dt');
			var ua = meta.querySelector('a[href^="/u"], a[href*="/u"]');
			var metaText = meta.textContent.replace(/\u00a0/g, ' ');
			var who = ua ? ua.textContent.trim() : (metaText.split(' - ')[0] || '').trim();
			var t = meta.querySelector('time.fm-date');
			var ms = 0, abs = '';
			if (t) {
				ms = new Date(t.getAttribute('datetime')).getTime() || 0;
				abs = t.getAttribute('data-abs') || t.textContent;
			} else {
				var m = DATE_RX.exec(metaText);
				if (m) {
					abs = m[0];
					var d = parseDate(m[0]);
					ms = d && !isNaN(d.getTime()) ? d.getTime() : 0;
				}
			}
			var subject = a.textContent.replace(/\u00a0/g, ' ').trim();
			out.push({
				id: id,
				folder: folder,
				href: href,
				subject: subject,
				key: pmSubject(subject).toLowerCase() + '|' + who.toLowerCase(),
				who: who,
				whoHTML: ua ? ua.outerHTML : esc(who),
				unread: /unread|_new/i.test(style),
				style: style,
				date: ms,
				abs: abs,
				boxName: box ? box.getAttribute('name') : ''
			});
		}
		return out;
	}

	/* how many pages a folder has, and how many messages per page */
	function gcd(a, b) {
		while (b) {
			var t = b;
			b = a % b;
			a = t;
		}
		return a;
	}

	function pmPages(doc, curStart) {
		var box = doc.querySelector('.fm-pm-pages') || doc.querySelector('.main-foot') ||
			doc.querySelector('.pagination') || doc.body;
		var starts = [];
		var links = box.querySelectorAll('a[href*="start="]');
		for (var i = 0; i < links.length; i++) {
			var m = /[?&]start=(\d+)/.exec(links[i].getAttribute('href'));
			if (m && +m[1] > 0) starts.push(+m[1]);
		}
		/* page size: the step between pages (links + the page we are on) */
		if (curStart > 0) starts.push(curStart);
		var size = starts.length ? starts.reduce(gcd) : 0;
		/* "Page 3 of 5" */
		var said = box.textContent.replace(/\s+/g, ' ').match(/page\s*\d+\s*\S+\s*\d+/i);
		var pm = said ? /(\d+)\D+(\d+)/.exec(said[0]) : null;
		var total = pm ? +pm[2] : (size ? Math.max.apply(Math, starts) / size + 1 : 1);
		return { size: size, total: total || 1 };
	}

	/* every row of a folder (first page given, or loaded) */
	function pmFolderRows(folder, firstDoc, firstStart) {
		var first = firstDoc ? Promise.resolve(firstDoc) : getDoc('/privmsg?folder=' + folder);
		return first.then(function (doc) {
			var rows = pmRows(doc, folder);
			var info = pmPages(doc, firstDoc ? firstStart : 0);
			var urls = [];
			if (info.size && info.total > 1) {
				for (var i = 0; i < Math.min(info.total, PMC.maxPages); i++) {
					var st = i * info.size;
					if (st === (firstDoc ? firstStart : 0)) continue;
					urls.push('/privmsg?folder=' + folder + (st ? '&start=' + st : ''));
				}
			}
			return pool(urls, PMC.together, getDoc).then(function (docs) {
				for (var j = 0; j < docs.length; j++) {
					if (docs[j]) rows = rows.concat(pmRows(docs[j], folder));
				}
				return rows;
			});
		});
	}

	function pmCacheRead(sig) {
		try {
			var c = JSON.parse(window.sessionStorage.getItem(PMC.cacheKey) || 'null');
			if (c && c.sig === sig && Date.now() - c.t < PMC.cacheTime) return c.rows;
		} catch (e) { /* blocked or broken */ }
		return null;
	}

	function pmCacheWrite(sig, rows) {
		try {
			window.sessionStorage.setItem(PMC.cacheKey, JSON.stringify({ sig: sig, t: Date.now(), rows: rows }));
		} catch (e) { /* full or blocked */ }
	}

	function pmCacheClear() {
		try { window.sessionStorage.removeItem(PMC.cacheKey); } catch (e) { /* blocked */ }
	}

	function isMine(link, folder) {
		var ud = window._userdata;
		if (link && ud && ud.user_id && +ud.user_id > 0) {
			var path = (link.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '');
			return new RegExp('^/u' + ud.user_id + '(?:\\D|$)').test(path);
		}
		return folder === 'sentbox' || folder === 'outbox';
	}

	/* one message, from its read page */

	function pathOf(a) {
		return (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
	}

	/* a link to a profile that shows a name (not an icon) */
	function nameLink(scope, path) {
		if (!scope) return null;
		var links = scope.querySelectorAll('a[href^="/u"], a[href*="/u"]');
		for (var i = 0; i < links.length; i++) {
			var l = links[i];
			if (l.querySelector('img') || l.closest('.fm-pm-contact') || !l.textContent.trim()) continue;
			if (!/^\/u\d+/.test(pathOf(l))) continue;
			if (path && pathOf(l) !== path) continue;
			return l;
		}
		return null;
	}

	function isIcon(img) {
		var src = img.getAttribute('src') || '';
		return /icon_|\/i\/fa\/|empty\.gif/i.test(src) || /^i_icon/.test(img.id || '') || /icon/i.test(img.className || '');
	}

	/* the name as Forumotion coloured it (group colour), when it is not a link */
	function styled(prof, plain) {
		var el = prof ? prof.querySelector('.usr_grp_clr, span[style*="color"] strong, strong') : null;
		if (el && !el.closest('a') && el.textContent.trim() === plain) {
			var top = el.closest('.usr_grp_clr, span[style*="color"]') || el;
			return top.outerHTML;
		}
		return esc(plain);
	}

	function pmMessage(doc, item) {
		var post = doc.querySelector('.fm-pm-read') || doc.querySelector('.post');
		if (!post) return null;
		var content = post.querySelector('.fm-post-content') || post.querySelector('.content');
		var prof = post.querySelector('.fm-pm-profile') || post.querySelector('.postprofile');
		var by = post.querySelector('.fm-pm-author') || post.querySelector('p.author');

		/* who sent it: the profile box only holds the sender */
		var anyLink = prof ? prof.querySelector('a[href^="/u"], a[href*="/u"]') : null;
		var profPath = anyLink && /^\/u\d+/.test(pathOf(anyLink)) ? pathOf(anyLink) : '';
		var name = nameLink(prof) || (profPath ? nameLink(by, profPath) : null);

		/* contact buttons (profile, message, e-mail, website...) */
		var contact = '';
		if (prof) {
			var icons = prof.querySelectorAll('a img');
			for (var c = 0; c < icons.length; c++) {
				if (!isIcon(icons[c])) continue;
				var link = icons[c].closest('a');
				if (link) contact += link.outerHTML;
			}
		}

		var av = null;
		if (prof) {
			var imgs = prof.querySelectorAll('img');
			for (var i = 0; i < imgs.length; i++) {
				if (imgs[i].closest('.fm-pm-contact') || isIcon(imgs[i])) continue;
				av = imgs[i];
				break;
			}
		}

		var plain = name ? name.textContent.trim() : '';
		if (!plain && prof) {
			var dt = prof.querySelector('dt') || prof;
			plain = (dt.textContent || '').replace(/\s+/g, ' ').trim();
		}
		if (!plain) plain = item.folder === 'sentbox' || item.folder === 'outbox' ? 'You' : item.who;

		var m = by ? DATE_RX.exec(by.textContent.replace(/\u00a0/g, ' ')) : null;
		var d = m ? parseDate(m[0]) : null;
		var reply = doc.querySelector('.fm-pm-reply a[href*="mode=reply"]') || doc.querySelector('a[href*="privmsg"][href*="mode=reply"]');
		var mine = anyLink && profPath ? isMine(anyLink, item.folder) : (item.folder === 'sentbox' || item.folder === 'outbox');

		return {
			html: content ? content.innerHTML : '',
			name: name ? name.outerHTML : (profPath ? '<a href="' + esc(profPath) + '">' + styled(prof, plain) + '</a>' : styled(prof, plain)),
			plainName: plain,
			mine: mine,
			avatar: av ? av.getAttribute('src') : '',
			contact: contact,
			date: d && !isNaN(d.getTime()) ? d.getTime() : item.date,
			abs: m ? m[0] : item.abs,
			reply: reply ? reply.getAttribute('href') : '',
			href: item.href,
			unread: item.unread && item.folder === pmFolder()
		};
	}

	function conversations() {
		var form = document.querySelector('form[name="privmsg_list"]') || document.querySelector('form.fm-pm');
		var list = form && form.querySelector('ul.pmlist');
		if (!list || /[?&]mode=/.test(window.location.search) || !window.fetch || !window.DOMParser) return;
		var folder = pmFolder();
		if (!PM_ALSO.hasOwnProperty(folder)) return;
		var firstStart = +((/[?&]start=(\d+)/.exec(window.location.search) || [])[1] || 0);
		var pageRows = pmRows(document, folder);
		if (!pageRows.length) return;

		var grouped = true;
		try { grouped = window.localStorage.getItem(PMC.modeKey) !== '0'; } catch (e) { /* default on */ }

		/* bar above the list: summary + switch */
		var bar = document.createElement('div');
		bar.className = 'fm-pmc-bar';
		bar.innerHTML =
			'<span class="fm-pmc-sum" aria-live="polite"></span>' +
			'<span class="fm-pmc-switch" role="radiogroup" aria-label="Show messages as">' +
			'<button type="button" role="radio" data-mode="1">Conversations</button>' +
			'<button type="button" role="radio" data-mode="0">All messages</button>' +
			'</span>';
		var holder = list.closest('.fm-pm-list') || list;
		holder.parentNode.insertBefore(bar, holder);
		var sum = bar.querySelector('.fm-pmc-sum');

		var glist = null, built = false, loading = false;
		var pages = document.querySelector('.fm-pm-pages');
		var boxName = pageRows[0].boxName || 'mark[]';

		function setMode(g) {
			grouped = g;
			try { window.localStorage.setItem(PMC.modeKey, g ? '1' : '0'); } catch (e) { /* blocked */ }
			var btns = bar.querySelectorAll('button');
			for (var i = 0; i < btns.length; i++) {
				var onNow = (btns[i].getAttribute('data-mode') === '1') === g;
				btns[i].classList.toggle('is-active', onNow);
				btns[i].setAttribute('aria-checked', onNow ? 'true' : 'false');
			}
			list.classList.toggle('fm-pmc-hide', g && built);
			if (glist) glist.classList.toggle('fm-pmc-hide', !g);
			if (pages) pages.classList.toggle('fm-pmc-hide', g && built);
			if (!g) {
				sum.textContent = '';
			} else if (built) {
				sum.textContent = sum.getAttribute('data-sum');
			} else {
				load();
			}
		}

		bar.addEventListener('click', function (e) {
			var b = e.target.closest('button[data-mode]');
			if (b) setMode(b.getAttribute('data-mode') === '1');
		});

		/* checkboxes of the form, by message id (adds hidden ones for other pages) */
		function realBox(id) {
			var boxes = form.querySelectorAll('input[type="checkbox"]');
			for (var i = 0; i < boxes.length; i++) {
				if (boxes[i].value === id && !boxes[i].classList.contains('fm-pmc-check')) return boxes[i];
			}
			var b = document.createElement('input');
			b.type = 'checkbox';
			b.name = boxName;
			b.value = id;
			b.hidden = true;
			b.className = 'fm-pmc-extra';
			form.appendChild(b);
			return b;
		}

		function syncChecks() {
			if (!glist) return;
			var convBoxes = glist.querySelectorAll('.fm-pmc-check');
			for (var i = 0; i < convBoxes.length; i++) {
				var ids = convBoxes[i].getAttribute('data-ids').split(',');
				var all = true, some = false;
				for (var j = 0; j < ids.length; j++) {
					var c = realBox(ids[j]).checked;
					all = all && c;
					some = some || c;
				}
				convBoxes[i].checked = all;
				convBoxes[i].indeterminate = some && !all;
			}
		}

		function build(rows) {
			/* one entry per message */
			var seen = {}, all = [];
			for (var i = 0; i < rows.length; i++) {
				var k = rows[i].folder + ':' + rows[i].id;
				if (seen[k]) continue;
				seen[k] = true;
				all.push(rows[i]);
			}

			var map = {}, convs = [];
			for (var j = 0; j < all.length; j++) {
				var r = all[j];
				var c = map[r.key];
				if (!c) {
					c = map[r.key] = { key: r.key, items: [], here: [] };
					convs.push(c);
				}
				c.items.push(r);
				if (r.folder === folder) c.here.push(r);
			}
			/* only conversations that have a message in this folder */
			convs = convs.filter(function (cv) { return cv.here.length; });
			convs.forEach(function (cv) {
				cv.items.sort(function (a, b) { return a.date - b.date; });
				cv.here.sort(function (a, b) { return a.date - b.date; });
				cv.latest = cv.items[cv.items.length - 1];
				cv.latestHere = cv.here[cv.here.length - 1];
				cv.unread = cv.here.filter(function (x) { return x.unread; }).length;
				cv.subject = pmSubject(cv.items[0].subject) || cv.items[0].subject;
			});
			convs.sort(function (a, b) { return b.latest.date - a.latest.date; });

			glist = document.createElement('ul');
			glist.className = 'topiclist pmlist bg_none fm-pmc-list';
			var total = 0;
			for (var n = 0; n < convs.length; n++) {
				total += convs[n].items.length;
				glist.appendChild(convRow(convs[n], n));
			}
			list.parentNode.insertBefore(glist, list.nextSibling);
			built = true;
			sum.setAttribute('data-sum', convs.length + (convs.length === 1 ? ' conversation' : ' conversations') +
				' \u00b7 ' + total + (total === 1 ? ' message' : ' messages'));
			syncChecks();
			setMode(grouped);
		}

		function convRow(cv, n) {
			var li = document.createElement('li');
			li.className = 'row ' + (n % 2 ? 'row2' : 'row1') + ' fm-pm-row fm-pmc' + (cv.unread ? ' fm-pmc-unread' : '');
			var icon = cv.unread ? cv.here.filter(function (x) { return x.unread; })[0].style : cv.latestHere.style;
			var ids = cv.here.map(function (x) { return x.id; }).join(',');
			var count = cv.items.length;
			li.innerHTML =
				'<dl class="icon" style="' + esc(icon) + '"><dt>' +
				'<span class="fm-pmc-line">' +
				'<a href="' + esc(cv.latestHere.href) + '" class="topictitle">' + esc(cv.subject) + '</a>' +
				(count > 1 ? '<span class="fm-pmc-count" title="' + count + ' messages">' + count + '</span>' : '') +
				(cv.unread ? '<span class="fm-pmc-new">' + cv.unread + ' new</span>' : '') +
				'</span>' +
				'<span class="fm-pm-meta"><em>' + cv.latestHere.whoHTML + ' - </em></span>' +
				'</dt><dd class="fm-pmc-chev" aria-hidden="true"></dd><dd class="mark"><input type="checkbox" class="fm-pmc-check" data-ids="' + esc(ids) + '" aria-label="Select conversation" /></dd></dl>';
			li.querySelector('.fm-pm-meta em').appendChild(mkTime(cv.latest.date, cv.latest.abs));
			li._conv = cv;
			return li;
		}

		function load() {
			if (loading || built) return;
			loading = true;
			bar.classList.add('is-loading');
			sum.textContent = 'Collecting conversations\u2026';
			var sig = folder + ':' + firstStart + ':' + pageRows.map(function (r) { return r.id + (r.unread ? 'u' : ''); }).join(',');
			var cached = pmCacheRead(sig);
			var job = cached ? Promise.resolve(cached) : Promise.all(
				[pmFolderRows(folder, document, firstStart)].concat(PM_ALSO[folder].map(function (f) {
					return pmFolderRows(f).catch(function () { return []; });
				}))
			).then(function (lists) {
				var rows = [].concat.apply([], lists);
				pmCacheWrite(sig, rows);
				return rows;
			});
			job.then(function (rows) {
				loading = false;
				bar.classList.remove('is-loading');
				build(rows);
			}).catch(function (e) {
				loading = false;
				bar.classList.remove('is-loading');
				sum.textContent = '';
				log('conversations failed', e);
			});
		}

		/* ---- opening a conversation ---- */

		function openConv(li) {
			var next = li.nextElementSibling;
			if (next && next.classList.contains('fm-pmc-thread')) {
				next.parentNode.removeChild(next);
				li.classList.remove('is-open');
				return;
			}
			var cv = li._conv;
			li.classList.add('is-open');
			var th = document.createElement('li');
			th.className = 'fm-pmc-thread';
			th.innerHTML =
				'<div class="fm-pmc-older"></div>' +
				'<div class="fm-pmc-msgs" aria-live="polite"></div>' +
				'<div class="fm-pmc-loading">Loading messages\u2026</div>' +
				'<div class="fm-pmc-foot"></div>';
			li.parentNode.insertBefore(th, li.nextSibling);
			var msgs = th.querySelector('.fm-pmc-msgs');
			var older = th.querySelector('.fm-pmc-older');
			var loadingEl = th.querySelector('.fm-pmc-loading');
			var shown = cv.items.length;
			var loadedReply = '';
			var first = true;

			function more() {
				var to = shown;
				var from = Math.max(0, to - PMC.perLoad);
				var part = cv.items.slice(from, to);
				shown = from;
				older.innerHTML = '';
				loadingEl.style.display = '';
				return pool(part, PMC.together, function (it) {
					return getDoc(it.href).then(function (doc) { return pmMessage(doc, it); });
				}).then(function (res) {
					loadingEl.style.display = 'none';
					var frag = document.createDocumentFragment();
					for (var i = 0; i < res.length; i++) {
						var mm = res[i] || {
							html: '<p class="fm-pmc-fail">This message could not be loaded. <a href="' + esc(part[i].href) + '">Open it</a></p>',
							name: part[i].whoHTML, mine: false, avatar: '', date: part[i].date, abs: part[i].abs, href: part[i].href, plainName: part[i].who
						};
						frag.appendChild(msgEl(mm));
					}
					msgs.insertBefore(frag, msgs.firstChild);
					/* reply link: from the newest message that offers one */
					if (first) {
						for (var k = res.length - 1; k >= 0; k--) {
							if (res[k] && res[k].reply) {
								loadedReply = res[k].reply;
								break;
							}
						}
					}
					if (shown > 0) {
						older.innerHTML = '<button type="button" class="fm-pmc-more">Show ' + Math.min(PMC.perLoad, shown) +
							' older message' + (Math.min(PMC.perLoad, shown) === 1 ? '' : 's') + '</button>';
					}
					if (first) {
						first = false;
						foot();
						markRead(li, cv);
						refreshDates();
						var target = msgs.querySelector('.fm-pmc-msg.is-new') || msgs.lastElementChild;
						if (target) target.scrollIntoView({ behavior: on('fm-pref-motion') ? 'auto' : 'smooth', block: 'nearest' });
					}
				});
			}

			function foot() {
				var f = th.querySelector('.fm-pmc-foot');
				f.innerHTML =
					(loadedReply ? '<a class="fm-pmc-reply" href="' + esc(loadedReply) + '"><span aria-hidden="true"></span>Reply</a>' : '') +
					'<a class="fm-pmc-latest" href="' + esc(cv.latestHere.href) + '">Open the latest message</a>';
			}

			older.addEventListener('click', function (e) {
				if (e.target.closest('.fm-pmc-more')) more();
			});
			more();
		}

		function msgEl(m) {
			var el = document.createElement('article');
			el.className = 'fm-pmc-msg' + (m.mine ? ' is-mine' : '') + (m.unread ? ' is-new' : '');
			var initial = (m.plainName || '?').trim().charAt(0).toUpperCase();
			el.innerHTML =
				'<div class="fm-pmc-av">' + (m.avatar ? '<img src="' + esc(m.avatar) + '" alt="" loading="lazy" />' : '<span>' + esc(initial) + '</span>') + '</div>' +
				'<div class="fm-pmc-bubble">' +
				'<div class="fm-pmc-head"><span class="fm-pmc-name">' + m.name + '</span>' +
				(m.mine ? '<span class="fm-pmc-you">You</span>' : '') +
				(m.unread ? '<span class="fm-pmc-newtag">New</span>' : '') +
				'<span class="fm-pmc-when"></span>' +
				(m.contact ? '<span class="fm-pmc-contact">' + m.contact + '</span>' : '') +
				'<a class="fm-pmc-open" href="' + esc(m.href) + '" title="Open this message" aria-label="Open this message"></a></div>' +
				'<div class="content fm-pmc-body">' + m.html + '</div>' +
				'</div>';
			el.querySelector('.fm-pmc-when').appendChild(mkTime(m.date, m.abs));
			return el;
		}

		/* the messages were opened, so Forumotion marks them read */
		function markRead(li, cv) {
			if (!cv.unread) return;
			cv.here.forEach(function (x) { x.unread = false; });
			cv.unread = 0;
			li.classList.remove('fm-pmc-unread');
			var n = li.querySelector('.fm-pmc-new');
			if (n) n.parentNode.removeChild(n);
			var dl = li.querySelector('dl.icon');
			if (dl) dl.setAttribute('style', dl.getAttribute('style').replace(/_unread|unread_|unread/i, function (s) {
				return s.replace(/unread/i, 'read');
			}));
			pmCacheClear();
		}

		/* clicks on the conversation list */
		form.addEventListener('click', function (e) {
			if (!glist || !glist.contains(e.target)) return;
			var chk = e.target.closest('.fm-pmc-check');
			if (chk) {
				var ids = chk.getAttribute('data-ids').split(',');
				for (var i = 0; i < ids.length; i++) realBox(ids[i]).checked = chk.checked;
				return;
			}
			if (e.target.closest('.fm-pmc-thread')) return;
			if (e.target.closest('dd.mark')) return;
			var li = e.target.closest('li.fm-pmc');
			if (!li) return;
			/* user names keep working as links */
			var a = e.target.closest('a');
			if (a && !a.classList.contains('topictitle')) return;
			e.preventDefault();
			openConv(li);
		});

		/* "Mark all / Unmark all" also tick the conversation boxes */
		document.addEventListener('click', function (e) {
			if (e.target.closest && e.target.closest('.fm-markall')) setTimeout(syncChecks, 0);
		}, true);

		/* deleting / moving changes the folder: forget the saved list */
		form.addEventListener('submit', pmCacheClear, true);

		setMode(grouped);
	}

	/* ====================================================================== */

	function start() {
		safe('progress bar', progressBar);
		safe('first unread', firstUnread);
		safe('quotes', quoteClicks);
		safe('lightbox', lightbox);
		safe('category badges', categoryBadges);
		safe('dates', wrapDates);
		safe('topic preview', topicPreview);
		safe('own posts', ownPosts);
		safe('word count', wordCount);
		safe('leave warning', leaveWarning);
		safe('quote selection', quoteSelection);
		safe('quote draft', quoteDraft);
		safe('levels', levels);
		safe('conversations', conversations);

		/* quotes are measured once images have loaded */
		if (document.readyState === 'complete') {
			safe('quotes', foldQuotes);
		} else {
			window.addEventListener('load', function () { safe('quotes', foldQuotes); });
		}

		/* "3 hours ago" keeps itself up to date (no network, just text) */
		setInterval(function () { safe('dates', refreshDates); }, 60000);

		/* options changed in the Display menu */
		window.addEventListener('fm:display', function () {
			safe('dates', refreshDates);
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();
