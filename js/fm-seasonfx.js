/* ==========================================================================
   THE COMMONS - season effects + New Year countdown
   Add in: Admin Panel > Modules > HTML & Javascript > Javascript codes
   management > Create a new JS > Placement: "In all the pages".
   Needs fm-theme-switcher.js.

   - Light falling effects that follow the theme:
       spring petals, summer sparkles, autumn leaves, winter snow,
       Halloween bats & embers, Christmas snow & stars, Valentine hearts,
       St. Patrick clovers, Easter petals & eggs, New Year confetti.
     Off when the visitor turns on "Reduce motion", "Hide seasonal
     decorations" or turns off "Falling effects", and for visitors whose
     device asks for reduced motion.
   - New Year countdown on 31 December (in the visitor's own time zone),
     confetti at midnight, and a "Happy New Year" note on 1 January.

   Errors go to the console with the [fm-fx] prefix.
   ========================================================================== */

(function () {
	'use strict';

	var root = document.documentElement;
	var DENSITY = 1; /* 0.5 = half as many particles, 2 = twice as many */

	function log(msg, err) {
		if (window.console && console.error) console.error('[fm-fx] ' + msg, err || '');
	}

	function has(cls) {
		return root.classList.contains(cls);
	}

	function systemReducedMotion() {
		return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
	}

	/* effects are allowed right now */
	function allowed() {
		return has('fm-pref-effects') && !has('fm-pref-motion') && !has('fm-pref-nodeco') && !systemReducedMotion();
	}

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	/* is the page light (summer, or a dark theme switched to light)? */
	function pageIsLight() {
		var bg = getComputedStyle(root).getPropertyValue('--fm-bg').trim();
		var m = /^#([0-9a-f]{6})$/i.exec(bg);
		if (!m) return false;
		var n = parseInt(m[1], 16);
		var lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
		return lum > 0.6;
	}

	/* ======================================================================
	   Shapes (drawn around 0,0, about 20px tall at size 1)
	   ====================================================================== */

	var P2D = typeof Path2D !== 'undefined';
	var PATHS = P2D ? {
		leaf: new Path2D('M0 -10C7 -8 10 2 0 11C-10 2 -7 -8 0 -10Z'),
		heart: new Path2D('M0 7C-7 2 -10 -1 -10 -4.5C-10 -8 -6.5 -10 -4 -9C-2 -8.4 -0.8 -7 0 -5.6C0.8 -7 2 -8.4 4 -9C6.5 -10 10 -8 10 -4.5C10 -1 7 2 0 7Z'),
		egg: new Path2D('M0 -10C6 -10 8 1 8 4C8 9 4 11 0 11C-4 11 -8 9 -8 4C-8 1 -6 -10 0 -10Z'),
		star: new Path2D('M0 -10L2.9 -4 9.5 -3.1 4.8 1.5 5.9 8.1 0 5 -5.9 8.1 -4.8 1.5 -9.5 -3.1 -2.9 -4Z'),
		spark: new Path2D('M0 -10Q1 -1 10 0Q1 1 0 10Q-1 1 -10 0Q-1 -1 0 -10Z')
	} : {};

	function drawShape(ctx, p, t) {
		var s = p.size / 20;
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.globalAlpha = p.alpha * (p.twinkle ? 0.55 + 0.45 * Math.sin(t * p.twinkle + p.phase) : 1);
		ctx.fillStyle = p.color;
		ctx.strokeStyle = p.color;

		switch (p.kind) {
		case 'dot':
			ctx.beginPath();
			ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
			ctx.fill();
			break;

		case 'petal':
			ctx.rotate(p.rot);
			ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(p.flip)));
			ctx.beginPath();
			ctx.ellipse(0, 0, p.size / 2, p.size / 3.4, 0, 0, Math.PI * 2);
			ctx.fill();
			break;

		case 'leaf':
			ctx.rotate(p.rot);
			ctx.scale(s * Math.max(0.25, Math.abs(Math.cos(p.flip))), s);
			ctx.fill(PATHS.leaf);
			ctx.globalAlpha *= 0.35;
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			ctx.moveTo(0, -8);
			ctx.lineTo(0, 10);
			ctx.stroke();
			break;

		case 'heart':
			ctx.rotate(Math.sin(p.phase + t * 1.2) * 0.25);
			ctx.scale(s, s);
			ctx.fill(PATHS.heart);
			break;

		case 'clover':
			ctx.rotate(p.rot);
			ctx.scale(s, s);
			for (var i = 0; i < 3; i++) {
				ctx.save();
				ctx.rotate(i * Math.PI * 2 / 3);
				ctx.translate(0, -6.6);
				ctx.scale(0.62, 0.62);
				ctx.translate(0, -7);
				ctx.fill(PATHS.heart);
				ctx.restore();
			}
			ctx.lineWidth = 1.6;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.quadraticCurveTo(2, 6, 5, 10);
			ctx.stroke();
			break;

		case 'egg':
			ctx.rotate(p.rot * 0.3);
			ctx.scale(s, s);
			ctx.fill(PATHS.egg);
			ctx.strokeStyle = 'rgba(255,255,255,.85)';
			ctx.lineWidth = 1.6;
			ctx.beginPath();
			ctx.moveTo(-7.6, 2);
			ctx.lineTo(-4.5, -0.5);
			ctx.lineTo(-1.5, 2);
			ctx.lineTo(1.5, -0.5);
			ctx.lineTo(4.5, 2);
			ctx.lineTo(7.6, -0.5);
			ctx.stroke();
			break;

		case 'star':
			ctx.rotate(p.rot);
			ctx.scale(s, s);
			ctx.fill(PATHS.star);
			break;

		case 'spark':
			ctx.rotate(p.rot * 0.2);
			ctx.scale(s, s);
			ctx.shadowColor = p.color;
			ctx.shadowBlur = 8;
			ctx.fill(PATHS.spark);
			break;

		case 'confetti':
			ctx.rotate(p.rot);
			ctx.scale(1, Math.cos(p.flip));
			ctx.fillRect(-p.size / 2, -p.size / 4.5, p.size, p.size / 2.2);
			break;

		case 'bat':
			var flap = Math.sin(t * 9 + p.phase);
			ctx.scale(p.dir * s, s);
			ctx.beginPath();
			ctx.ellipse(0, 0, 2.6, 4, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.beginPath();
			ctx.moveTo(1.5, -1);
			ctx.quadraticCurveTo(7, -7 * flap - 2, 13, -3 * flap - 1);
			ctx.quadraticCurveTo(10, 1, 8, 1);
			ctx.quadraticCurveTo(5, 0, 1.5, 2);
			ctx.moveTo(-1.5, -1);
			ctx.quadraticCurveTo(-7, -7 * flap - 2, -13, -3 * flap - 1);
			ctx.quadraticCurveTo(-10, 1, -8, 1);
			ctx.quadraticCurveTo(-5, 0, -1.5, 2);
			ctx.fill();
			break;
		}
		ctx.restore();
	}

	/* ======================================================================
	   What falls for each theme
	   count: particles at 1400px width; dir: down | up | across
	   size: [min, max] px; speed: [min, max] px per second
	   light: colours used when the page is light
	   ====================================================================== */

	var FX = {
		spring: [
			{ kind: 'petal', count: 16, dir: 'down', size: [7, 12], speed: [22, 45], sway: 40, spin: 1.2,
				colors: ['#ffc4d6', '#f29bbb', '#ffffff'], light: ['#f29bbb', '#e77aa3', '#f7b6cc'], alpha: 0.85 }
		],
		summer: [
			{ kind: 'spark', count: 14, dir: 'up', size: [5, 9], speed: [10, 22], sway: 22, twinkle: 2.2,
				colors: ['#ffd36b', '#ffb347'], light: ['#f0a01c', '#f6b42c'], alpha: 0.75 }
		],
		autumn: [
			{ kind: 'leaf', count: 14, dir: 'down', size: [12, 19], speed: [28, 55], sway: 60, spin: 1.6,
				colors: ['#c9612b', '#e2a33a', '#a8432a', '#d9822b'], alpha: 0.85 }
		],
		winter: [
			{ kind: 'dot', count: 46, dir: 'down', size: [2, 5], speed: [20, 50], sway: 18,
				colors: ['#ffffff', '#e6f3ff'], light: ['#a9c9e8', '#bcd6ee'], alpha: 0.8 }
		],
		halloween: [
			{ kind: 'bat', count: 4, dir: 'across', size: [16, 26], speed: [40, 75], sway: 30,
				colors: ['#3b2d4a', '#4a3a5c'], light: ['#2b2230', '#3a2d42'], alpha: 0.9 },
			{ kind: 'dot', count: 12, dir: 'up', size: [2, 4], speed: [14, 30], sway: 16, twinkle: 3,
				colors: ['#ff7a1a', '#9be564'], light: ['#e0620a', '#4f9a25'], alpha: 0.7 }
		],
		christmas: [
			{ kind: 'dot', count: 36, dir: 'down', size: [2, 5], speed: [20, 45], sway: 18,
				colors: ['#ffffff'], light: ['#b9cbb9'], alpha: 0.8 },
			{ kind: 'star', count: 4, dir: 'down', size: [9, 13], speed: [18, 30], sway: 20, spin: 0.6, twinkle: 2.5,
				colors: ['#f2c14e'], light: ['#d4a017'], alpha: 0.85 }
		],
		valentine: [
			{ kind: 'heart', count: 14, dir: 'up', size: [10, 18], speed: [18, 36], sway: 30,
				colors: ['#ff4f7b', '#ff9ec0', '#e23b5a'], light: ['#e8355f', '#ff7aa2', '#c92748'], alpha: 0.75 }
		],
		stpatrick: [
			{ kind: 'clover', count: 13, dir: 'down', size: [13, 20], speed: [24, 45], sway: 40, spin: 1,
				colors: ['#2fbf5b', '#5ad17c', '#1f9a47'], light: ['#1f9a47', '#2fbf5b'], alpha: 0.8 },
			{ kind: 'dot', count: 6, dir: 'down', size: [4, 6], speed: [30, 50], sway: 10, twinkle: 4,
				colors: ['#f2c94c'], light: ['#d4a017'], alpha: 0.85 }
		],
		easter: [
			{ kind: 'petal', count: 12, dir: 'down', size: [7, 11], speed: [20, 40], sway: 36, spin: 1.2,
				colors: ['#c9a7ff', '#ffd27a', '#8fe3b8', '#ffb3c7'], alpha: 0.8 },
			{ kind: 'egg', count: 5, dir: 'down', size: [14, 19], speed: [26, 40], sway: 24, spin: 1,
				colors: ['#c9a7ff', '#8fe3b8', '#ffb3c7', '#ffd27a'], alpha: 0.9 }
		],
		newyear: [
			{ kind: 'confetti', count: 30, dir: 'down', size: [7, 11], speed: [35, 70], sway: 30, spin: 3,
				colors: ['#f4c95d', '#9fd8ff', '#ff6b8b', '#b69cff', '#7fe0b0'], alpha: 0.9 },
			{ kind: 'spark', count: 8, dir: 'down', size: [6, 10], speed: [15, 25], sway: 12, twinkle: 3,
				colors: ['#f4c95d', '#ffffff'], light: ['#d4a017', '#e6b545'], alpha: 0.8 }
		]
	};

	/* ======================================================================
	   Falling effects
	   ====================================================================== */

	var canvas = null, ctx = null, parts = [], running = false, last = 0, W = 0, H = 0, dpr = 1;
	var current = null;

	function makeParticle(spec, light, spread) {
		var p = {
			kind: spec.kind,
			dirName: spec.dir,
			size: rand(spec.size[0], spec.size[1]),
			speed: rand(spec.speed[0], spec.speed[1]),
			sway: spec.sway || 0,
			swayFreq: rand(0.4, 1.1),
			spin: spec.spin ? rand(-spec.spin, spec.spin) : 0,
			twinkle: spec.twinkle || 0,
			color: pick(light && spec.light ? spec.light : spec.colors),
			alpha: spec.alpha * rand(0.75, 1),
			phase: rand(0, Math.PI * 2),
			rot: rand(0, Math.PI * 2),
			flip: rand(0, Math.PI * 2),
			dir: Math.random() < 0.5 ? -1 : 1
		};
		reset(p, spread);
		return p;
	}

	/* put a particle back at its starting edge (or anywhere, at the start) */
	function reset(p, spread) {
		if (p.dirName === 'across') {
			p.x0 = p.dir > 0 ? -40 : W + 40;
			if (spread) p.x0 = rand(0, W);
			p.y0 = rand(H * 0.05, H * 0.6);
		} else {
			p.x0 = rand(0, W);
			if (p.dirName === 'down') {
				p.y0 = spread ? rand(-H, H) : rand(-60, -20);
			} else {
				p.y0 = spread ? rand(0, H * 2) : H + rand(20, 60);
			}
		}
		p.x = p.x0;
		p.y = p.y0;
		p.age = 0;
	}

	function build() {
		parts = [];
		var specs = FX[current] || [];
		var light = pageIsLight();
		var scale = Math.max(0.45, Math.min(1, W / 1400)) * DENSITY;
		for (var i = 0; i < specs.length; i++) {
			var n = Math.max(1, Math.round(specs[i].count * scale));
			for (var j = 0; j < n; j++) parts.push(makeParticle(specs[i], light, true));
		}
	}

	function resize() {
		if (!canvas) return;
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		W = window.innerWidth;
		H = window.innerHeight;
		canvas.width = Math.round(W * dpr);
		canvas.height = Math.round(H * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function frame(now) {
		if (!running) return;
		var dt = Math.min(0.05, (now - last) / 1000 || 0);
		last = now;
		var t = now / 1000;
		ctx.clearRect(0, 0, W, H);

		for (var i = 0; i < parts.length; i++) {
			var p = parts[i];
			p.age += dt;
			p.rot += p.spin * dt;
			p.flip += p.spin * dt * 1.7;

			if (p.dirName === 'across') {
				p.x += p.dir * p.speed * dt;
				p.y = p.y0 + Math.sin(p.age * p.swayFreq * 2 + p.phase) * p.sway;
				if (p.x < -60 || p.x > W + 60) reset(p, false);
			} else {
				var v = p.dirName === 'down' ? 1 : -1;
				p.y += v * p.speed * dt;
				p.x = p.x0 + Math.sin(p.age * p.swayFreq + p.phase) * p.sway;
				if ((v > 0 && p.y > H + 40) || (v < 0 && p.y < -40)) reset(p, false);
			}
			drawShape(ctx, p, t);
		}
		window.requestAnimationFrame(frame);
	}

	function start() {
		if (!P2D || !document.body) return;
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.className = 'fm-fx-canvas';
			canvas.setAttribute('aria-hidden', 'true');
			document.body.appendChild(canvas);
			ctx = canvas.getContext('2d');
		}
		canvas.style.display = '';
		resize();
		build();
		if (!running) {
			running = true;
			last = performance.now();
			window.requestAnimationFrame(frame);
		}
	}

	function stop() {
		running = false;
		parts = [];
		if (canvas) {
			ctx.clearRect(0, 0, W, H);
			canvas.style.display = 'none';
		}
	}

	/* called on start and whenever the theme or the options change */
	function update() {
		var theme = root.getAttribute('data-style');
		if (!allowed() || !FX[theme]) {
			current = null;
			stop();
			return;
		}
		if (theme === current && running) {
			/* light/dark may have flipped: recolour */
			build();
			return;
		}
		current = theme;
		start();
	}

	/* ======================================================================
	   Confetti burst (New Year at midnight)
	   ====================================================================== */

	window.fmConfetti = function () {
		if (!P2D || has('fm-pref-motion') || systemReducedMotion()) return;
		var c = document.createElement('canvas');
		c.className = 'fm-fx-canvas fm-fx-burst';
		c.setAttribute('aria-hidden', 'true');
		document.body.appendChild(c);
		var x = c.getContext('2d');
		var r = Math.min(window.devicePixelRatio || 1, 2);
		var w = window.innerWidth, h = window.innerHeight;
		c.width = w * r;
		c.height = h * r;
		x.setTransform(r, 0, 0, r, 0, 0);

		var colors = ['#f4c95d', '#9fd8ff', '#ff6b8b', '#b69cff', '#7fe0b0', '#ffffff'];
		var bits = [];
		for (var i = 0; i < 160; i++) {
			var fromLeft = i % 2 === 0;
			var ang = (fromLeft ? -60 : -120) + rand(-22, 22);
			var spd = rand(520, 980);
			bits.push({
				kind: 'confetti',
				x: fromLeft ? -10 : w + 10,
				y: h * 0.85,
				vx: Math.cos(ang * Math.PI / 180) * spd,
				vy: Math.sin(ang * Math.PI / 180) * spd,
				size: rand(7, 12),
				color: pick(colors),
				alpha: 1,
				rot: rand(0, 6),
				flip: rand(0, 6),
				spin: rand(-8, 8),
				phase: 0,
				twinkle: 0
			});
		}
		var t0 = performance.now(), prev = t0;
		function step(now) {
			var dt = Math.min(0.05, (now - prev) / 1000);
			prev = now;
			var age = (now - t0) / 1000;
			x.clearRect(0, 0, w, h);
			for (var i = 0; i < bits.length; i++) {
				var b = bits[i];
				b.vy += 900 * dt;
				b.vx *= 0.985;
				b.vy *= 0.985;
				b.x += b.vx * dt;
				b.y += b.vy * dt;
				b.rot += b.spin * dt;
				b.flip += b.spin * dt * 1.5;
				b.alpha = Math.max(0, 1 - Math.max(0, age - 3) / 1.5);
				drawShape(x, b, age);
			}
			if (age < 4.5) {
				window.requestAnimationFrame(step);
			} else if (c.parentNode) {
				c.parentNode.removeChild(c);
			}
		}
		window.requestAnimationFrame(step);
	};

	/* ======================================================================
	   New Year countdown (31 Dec) and greeting (1 Jan)
	   ====================================================================== */

	var NY_KEY = 'fmNewYearHide';

	function store(k, v) {
		try { window.localStorage.setItem(k, v); } catch (e) { /* blocked */ }
	}
	function read(k) {
		try { return window.localStorage.getItem(k); } catch (e) { return null; }
	}

	function pad(n) {
		return (n < 10 ? '0' : '') + n;
	}

	function newYear() {
		var box = null, timer = null, mode = null;

		function place(el) {
			var after = document.getElementById('fm-holiday-banner') ||
				document.getElementById('page-header') || document.querySelector('.fm-topnav');
			if (!after || !after.parentNode) return false;
			after.parentNode.insertBefore(el, after.nextSibling);
			return true;
		}

		function remove() {
			if (timer) clearTimeout(timer);
			timer = null;
			if (box && box.parentNode) box.parentNode.removeChild(box);
			box = null;
			mode = null;
		}

		function build(kind, year) {
			remove();
			mode = kind;
			box = document.createElement('div');
			box.id = 'fm-newyear';
			box.className = 'fm-newyear fm-newyear-' + kind;
			box.setAttribute('role', 'status');
			if (kind === 'count') {
				box.innerHTML =
					'<span class="fm-ny-ico" aria-hidden="true"></span>' +
					'<span class="fm-ny-label">' + year + ' in</span>' +
					'<span class="fm-ny-clock" aria-live="off">' +
					'<span class="fm-ny-unit"><b class="fm-ny-h">00</b><i>hours</i></span><span class="fm-ny-sep">:</span>' +
					'<span class="fm-ny-unit"><b class="fm-ny-m">00</b><i>min</i></span><span class="fm-ny-sep">:</span>' +
					'<span class="fm-ny-unit"><b class="fm-ny-s">00</b><i>sec</i></span>' +
					'</span>' +
					'<button type="button" class="fm-ny-close" title="Hide" aria-label="Hide"></button>';
			} else {
				box.innerHTML =
					'<span class="fm-ny-ico" aria-hidden="true"></span>' +
					'<span class="fm-ny-label">Happy New Year <strong>' + year + '</strong>!</span>' +
					'<button type="button" class="fm-ny-again">Confetti</button>' +
					'<button type="button" class="fm-ny-close" title="Hide" aria-label="Hide"></button>';
				box.querySelector('.fm-ny-again').addEventListener('click', function () {
					window.fmConfetti();
				});
			}
			box.querySelector('.fm-ny-close').addEventListener('click', function () {
				store(NY_KEY, kind + '-' + year);
				remove();
			});
			if (!place(box)) box = null;
		}

		function tick() {
			timer = null;
			var now = new Date();
			var m = now.getMonth(), d = now.getDate();

			if (m === 11 && d === 31) {
				var year = now.getFullYear() + 1;
				if (read(NY_KEY) === 'count-' + year) return;
				if (mode !== 'count') build('count', year);
				if (!box) return;
				var midnight = new Date(now.getFullYear() + 1, 0, 1);
				var left = Math.max(0, Math.ceil((midnight - now) / 1000));
				box.querySelector('.fm-ny-h').textContent = pad(Math.floor(left / 3600));
				box.querySelector('.fm-ny-m').textContent = pad(Math.floor(left % 3600 / 60));
				box.querySelector('.fm-ny-s').textContent = pad(left % 60);
				box.classList.toggle('is-final', left <= 10);
				box.classList.toggle('is-last-hour', left <= 3600);
				timer = setTimeout(tick, 1000 - now.getMilliseconds() + 5);
				return;
			}

			if (m === 0 && d === 1) {
				var y = now.getFullYear();
				var justTurned = mode === 'count';
				if (read(NY_KEY) !== 'hello-' + y && mode !== 'hello') build('hello', y);
				/* confetti once: at midnight, or on the first visit of the day */
				var seen = null;
				try { seen = window.sessionStorage.getItem('fmNewYearConfetti'); } catch (e) { /* blocked */ }
				if (justTurned || (seen !== String(y) && read('fmNewYearConfetti') !== String(y))) {
					store('fmNewYearConfetti', String(y));
					try { window.sessionStorage.setItem('fmNewYearConfetti', String(y)); } catch (e) { /* blocked */ }
					if (has('fm-pref-effects')) setTimeout(window.fmConfetti, 400);
				}
				return;
			}
			remove();
		}

		tick();
	}

	/* ====================================================================== */

	function init() {
		try { update(); } catch (e) { log('effects failed', e); }
		try { newYear(); } catch (e) { log('countdown failed', e); }

		window.addEventListener('resize', function () {
			if (!running) return;
			resize();
			build();
		});

		/* options changed in the Display menu */
		window.addEventListener('fm:display', function () {
			try { update(); } catch (e) { log('effects failed', e); }
		});

		/* theme changed */
		if (window.MutationObserver) {
			new MutationObserver(function () {
				try { update(); } catch (e) { log('effects failed', e); }
			}).observe(root, { attributes: true, attributeFilter: ['data-style'] });
		}

		if (window.matchMedia) {
			var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
			if (mq.addEventListener) mq.addEventListener('change', update);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
