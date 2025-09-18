// Timetable App Script (vanilla JS)
// Requirements implemented: fetch timetable.json, fixed SLOTS array, utility functions,
// findCurrentClass, renderers for views, navigation wiring, and error handling for file:// failures.

// ------------------------------
// Constants & Utilities
// ------------------------------

const SLOTS = [
	"09:30-10:30",
	"10:30-11:30",
	"11:30-12:30",
	"12:30-13:30",
	"13:30-14:30",
	"14:30-15:30",
	"15:30-16:30",
	"16:30-17:30",
];

function timeStrToMinutes(hhmm) {
	// hhmm: "HH:MM" -> minutes since midnight
	const [h, m] = hhmm.split(":").map(Number);
	return h * 60 + m;
}

function parseRange(rangeStr) {
	// rangeStr: "HH:MM-HH:MM" -> { start, end } minutes
	const [startStr, endStr] = rangeStr.split("-");
	return { start: timeStrToMinutes(startStr), end: timeStrToMinutes(endStr) };
}

function getCurrentMinutes(date = new Date()) {
	return date.getHours() * 60 + date.getMinutes();
}

function getDayNameFromDate(date = new Date()) {
	// Returns capitalized day: "Monday", ... "Sunday"
	const dayNames = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	return dayNames[date.getDay()];
}

// ------------------------------
// Data Fetching
// ------------------------------

let TIMETABLE = null; // will be set after fetch
let IS_LOADING = false;

async function loadTimetable() {
	IS_LOADING = true;
	showSkeletons();
	try {
		const res = await fetch("timetable.json", { cache: "no-store" });
		if (!res.ok) {
			throw new Error(`Failed to fetch timetable.json: ${res.status} ${res.statusText}`);
		}
		TIMETABLE = await res.json();
	} catch (err) {
		TIMETABLE = null;
		// Clear error message for local file:// restrictions
		console.error(
			"Unable to load timetable.json. If you opened index.html directly using file://, many browsers block fetch() for local files. Please serve the folder with a local web server.",
			err
		);
		if (location.hostname && location.hostname !== 'localhost') {
			console.warn('Note: Tailwind CDN is great for development, but not recommended for production. Consider installing Tailwind via CLI or PostCSS.');
		}
		const root = document.querySelector("main");
		if (root) {
			const alert = document.createElement("div");
			alert.className =
				"rounded-md border border-red-200 bg-red-50 text-red-900 p-3 text-sm transition-all duration-300";
			alert.textContent =
				"Error loading timetable.json. If opened via file://, please run a local server (e.g., Python http.server) to allow fetch.";
			root.prepend(alert);
		}
	} finally {
		IS_LOADING = false;
		hideSkeletons();
	}
}

// ------------------------------
// Core Logic
// ------------------------------

function findCurrentClass(dayName, minutes) {
	if (!TIMETABLE) return null;
	const key = dayName.toLowerCase();
	const dayArr = TIMETABLE[key];
	if (!Array.isArray(dayArr)) return null;
	// Find slot where minutes is in [start, end)
	for (const item of dayArr) {
		const { start, end } = parseRange(item.time);
		if (minutes >= start && minutes < end) return item;
	}
	return null;
}

// ------------------------------
// Rendering Helpers
// ------------------------------

function h(tag, className, text) {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text != null) el.textContent = text;
	return el;
}

function clear(el) {
	while (el.firstChild) el.removeChild(el.firstChild);
}

function renderNowView() {
	const container = document.getElementById("nowView");
	if (!container) return;
	// default placeholder container content is already in HTML; we replace it
	clear(container);

	const heading = h(
		"h2",
		"text-lg font-semibold tracking-tight text-gray-800 dark:text-gray-100",
		"Happening Now"
	);

	const card = h(
		"div",
		"rounded-2xl p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out space-y-1 scale-in " +
		"bg-white/90 border border-gray-200 dark:bg-slate-800/90 dark:border-gray-700"
	);


	const dayName = getDayNameFromDate();
	const minutes = getCurrentMinutes();

	let content;
	if (!TIMETABLE) {
		content = "Timetable not loaded.";
	} else if (!TIMETABLE[dayName.toLowerCase()]) {
		content = `No timetable for ${dayName}.`;
	} else {
		const current = findCurrentClass(dayName, minutes);
		if (current) {
			card.append(
				h("div", "text-sm text-gray-500", `${dayName}`),
				h("div", "text-lg font-semibold", `${current.subject}`),
				h(
					"div",
					"text-sm text-gray-600 dark:text-gray-300",
					`${current.time} • Room: ${current.room} • ${current.faculty}`
				)
			);
		} else {
			content = `No ongoing class right now (${dayName}, ${String(
				Math.floor(minutes / 60)
			).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}).`;
		}
	}

	const wrap = h("div");
	if (content) wrap.append(h("p", "text-sm text-gray-600 dark:text-gray-400", content));
	container.append(heading, card, wrap);
	// subtle pulse ring to indicate refresh
	try {
		card.classList.add("ring-0", "ring-indigo-400/0");
		requestAnimationFrame(() => {
			card.classList.add("ring", "ring-indigo-400/30", "show");
			setTimeout(() => card.classList.remove("ring", "ring-indigo-400/30"), 500);
		});
	} catch { }
}

function renderDailyView(dayName) {
	const container = document.getElementById("dailyView");
	if (!container) return;

	// Keep the top controls (first child wrapper with select), replace schedule block only
	const schedule = document.getElementById("dailySchedule");
	if (!schedule) return;
	clear(schedule);

	const name = dayName || document.getElementById("daySelect")?.value || "monday";
	const list = TIMETABLE?.[name.toLowerCase()];

	if (!list) {
		schedule.append(
			h(
				"p",
				"text-sm text-gray-600 dark:text-gray-400",
				"Select a day to see the schedule or ensure timetable.json is loaded."
			)
		);
		return;
	}

	const ul = h("ul", "space-y-3 stagger");
	const todayName = getDayNameFromDate();
	const isToday = todayName.toLowerCase() === name.toLowerCase();
	const nowMins = getCurrentMinutes();
	for (const slot of SLOTS) {
		const match = list.find((x) => x.time === slot);
		const li = h(
			"li",
			"p-3 rounded-2xl border border-gray-200/60 dark:border-gray-700 bg-white/80 dark:bg-gray-800 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out flex items-center justify-between gap-3"
		);
		if (isToday) {
			const { start, end } = parseRange(slot);
			if (nowMins >= start && nowMins < end) {
				li.classList.add("ring", "ring-indigo-400/40", "bg-indigo-50/50", "dark:bg-gray-700/40");
			}
		}
		if (match) {
			const left = h("div");
			left.append(
				h("div", "text-sm font-semibold", match.subject),
				h("div", "text-xs text-gray-500 dark:text-gray-400", `${match.room} • ${match.faculty}`)
			);
			const right = h(
				"div",
				"text-xs font-mono text-gray-600 dark:text-gray-300 shrink-0",
				match.time
			);
			li.append(left, right);
		} else {
			li.append(
				h("div", "text-sm text-gray-400", "— Free —"),
				h("div", "text-xs font-mono text-gray-400", slot)
			);
		}
		ul.append(li);
	}
	schedule.append(ul);
	// trigger stagger animation
	requestAnimationFrame(() => ul.classList.add('show'));
}

function renderWeeklyView() {
	const container = document.getElementById("weeklyView");
	if (!container) return;
	// Replace body inside container but keep heading (first child)
	clear(container);
	container.append(h("h2", "text-base font-semibold", "This Week"));

	if (!TIMETABLE) {
		container.append(
			h(
				"p",
				"text-sm text-gray-600 dark:text-gray-400",
				"Timetable data not loaded. Start a local server to load timetable.json."
			)
		);
		return;
	}

	const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	// Responsive scrollable table
	const wrap = h("div", "overflow-x-auto rounded-2xl border border-gray-200/60 dark:border-gray-700 glass shadow-sm fade-in");
	const table = h("table", "min-w-full text-sm table-grid");

	const thead = h("thead");
	const headRow = h("tr", "bg-gray-50/70 dark:bg-gray-700/40");
	headRow.append(
		h("th", "px-3 py-2 text-left font-semibold rounded-tl-2xl", "Day"),
		...SLOTS.map((s, i) => h("th", `px-3 py-2 text-left font-semibold ${i === SLOTS.length - 1 ? 'rounded-tr-2xl' : ''}`, s))
	);
	thead.append(headRow);

	const tbody = h("tbody", "divide-y divide-gray-100 dark:divide-gray-700");

	days.forEach((day) => {
		const tr = h("tr", "odd:bg-white/60 even:bg-gray-50/40 dark:odd:bg-gray-800/60 dark:even:bg-gray-800/40 hover:bg-indigo-50/60 dark:hover:bg-gray-700/40 transition-colors duration-300 ease-out");
		tr.append(h("td", "px-3 py-2 font-medium whitespace-nowrap", day));
		const list = TIMETABLE[day.toLowerCase()] || [];
		SLOTS.forEach((slot) => {
			const match = list.find((x) => x.time === slot);
			const content = match ? `${match.subject}` : "—";
			tr.append(h("td", "px-3 py-2 whitespace-nowrap", content));
		});
		tbody.append(tr);
	});

	table.append(thead, tbody);
	wrap.append(table);
	container.append(wrap);
	requestAnimationFrame(() => wrap.classList.add('show'));
}

// ------------------------------
// Navigation & Initialization
// ------------------------------

function showView(targetId) {
	const ids = ["nowView", "dailyView", "weeklyView"];
	for (const id of ids) {
		const el = document.getElementById(id);
		if (!el) continue;
		if (id === targetId) {
			el.classList.remove("hidden");
			requestAnimationFrame(() => {
				el.classList.remove("opacity-0");
				el.classList.add("opacity-100");
			});
		} else {
			el.classList.remove("opacity-100");
			el.classList.add("opacity-0");
			setTimeout(() => el.classList.add("hidden"), 400);
		}
	}

	// Set button active state
	const map = {
		nowView: "btnNow",
		dailyView: "btnDaily",
		weeklyView: "btnWeekly",
	};
	Object.entries(map).forEach(([viewId, btnId]) => {
		const btn = document.getElementById(btnId);
		if (!btn) return;
		if (viewId === targetId) {
			btn.style.setProperty('--slide-origin', 'left');
			btn.classList.add("is-active");
			btn.setAttribute("aria-current", "page");
		} else {
			btn.classList.remove("is-active");
			btn.removeAttribute("aria-current");
		}
	});

	updateNavIndicator();
}

async function init() {
	// Wire nav buttons
	const btnNow = document.getElementById("btnNow");
	const btnDaily = document.getElementById("btnDaily");
	const btnWeekly = document.getElementById("btnWeekly");
	btnNow?.addEventListener("click", () => {
		showView("nowView");
		renderNowView();
	});
	btnDaily?.addEventListener("click", () => {
		showView("dailyView");
		renderDailyView();
	});
	btnWeekly?.addEventListener("click", () => {
		showView("weeklyView");
		renderWeeklyView();
	});

	// Day select
	const daySelect = document.getElementById("daySelect");
	daySelect?.addEventListener("change", (e) => {
		const name = e.target.value;
		renderDailyView(name);
	});

	await loadTimetable();

	// Initial render: Now view
	showView("nowView");
	renderNowView();

	// Pre-render other views to avoid blank on first switch
	renderDailyView();
	renderWeeklyView();

	// Optional: refresh Now view every minute
	setInterval(() => {
		if (!document.getElementById("nowView").classList.contains("hidden")) {
			renderNowView();
		}
	}, 60 * 1000);

	// Theme: initialize from localStorage, sync checkbox state, and wire change
	applySavedTheme();
	const themeToggle = document.getElementById("themeToggle");
	if (themeToggle) {
		// set checkbox from current class
		themeToggle.checked = document.documentElement.classList.contains("dark");
		themeToggle.addEventListener("change", (e) => {
			const isDark = e.target.checked;
			document.documentElement.classList.toggle("dark", isDark);
			try { localStorage.setItem("timetable-theme", isDark ? "dark" : "light"); } catch { }
		});
	}

	// 3D tilt on nav buttons (lightweight parallax)
	const navButtons = [document.getElementById('btnNow'), document.getElementById('btnDaily'), document.getElementById('btnWeekly')].filter(Boolean);
	let raf = null;
	const handle = (btn, e) => {
		const rect = btn.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width; // 0..1
		const y = (e.clientY - rect.top) / rect.height; // 0..1
		const rx = (0.5 - y) * 8; // max 8deg tilt
		const ry = (x - 0.5) * 12;
		const face = btn.querySelector('.btn-face') || btn;
		face.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
		face.style.transition = 'transform 60ms linear';
		btn.style.setProperty('--mx', `${(x * 100).toFixed(2)}%`);
		btn.style.setProperty('--my', `${(y * 100).toFixed(2)}%`);
	};
	// Start background animation once
	startRipples();
	navButtons.forEach(btn => {
		btn.addEventListener('mousemove', (e) => {
			if (raf) cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => handle(btn, e));
		});
		btn.addEventListener('mouseleave', () => {
			const face = btn.querySelector('.btn-face') || btn;
			face.style.transition = 'transform 300ms ease';
			face.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) translateZ(0)';
			btn.style.setProperty('--mx', '50%');
			btn.style.setProperty('--my', '50%');
		});
	});

	window.addEventListener('resize', () => updateNavIndicator());
	updateNavIndicator();
}

// Kickoff after DOM ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}

// Expose utility functions for potential testing/debugging
window.TimetableApp = {
	SLOTS,
	timeStrToMinutes,
	parseRange,
	getCurrentMinutes,
	getDayNameFromDate,
	findCurrentClass,
	renderNowView,
	renderDailyView,
	renderWeeklyView,
};

// ------------------------------
// Skeleton helpers
// ------------------------------
function showSkeletons() {
	const now = document.getElementById('nowView');
	const daily = document.getElementById('dailySchedule');
	const weekly = document.getElementById('weeklyView');
	if (now && !document.getElementById('sk-now')) {
		const sk = document.createElement('div');
		sk.id = 'sk-now';
		sk.className = 'mt-2 rounded-2xl border border-gray-200/60 dark:border-gray-700 bg-white/80 dark:bg-gray-800 p-4 shadow-sm animate-pulse';
		sk.innerHTML = '<div class="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3"></div><div class="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div><div class="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded"></div>';
		now.appendChild(sk);
	}
	if (daily && !document.getElementById('sk-daily')) {
		const sk = document.createElement('div');
		sk.id = 'sk-daily';
		sk.className = 'space-y-3';
		sk.innerHTML = new Array(4).fill('').map(() => '<div class="h-14 rounded-2xl border border-gray-200/60 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 animate-pulse"></div>').join('');
		daily.appendChild(sk);
	}
	if (weekly && !document.getElementById('sk-weekly')) {
		const sk = document.createElement('div');
		sk.id = 'sk-weekly';
		sk.className = 'rounded-2xl border border-gray-200/60 dark:border-gray-700 bg-white/80 dark:bg-gray-800 p-4 shadow-sm animate-pulse';
		sk.innerHTML = '<div class="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-3"></div><div class="h-40 w-full bg-gray-100 dark:bg-gray-800 rounded"></div>';
		weekly.appendChild(sk);
	}
}

function hideSkeletons() {
	['sk-now', 'sk-daily', 'sk-weekly'].forEach(id => document.getElementById(id)?.remove());
}

// ------------------------------
// Theme helpers
// ------------------------------
function applySavedTheme() {
	try {
		const saved = localStorage.getItem("timetable-theme");
		if (saved === "dark") {
			document.documentElement.classList.add("dark");
		} else if (saved === "light") {
			document.documentElement.classList.remove("dark");
		} else {
			// system preference as fallback
			const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
			if (prefersDark) document.documentElement.classList.add("dark");
		}
	} catch { }
}

// icon text no longer used (CSS toggle has its own icon)

// ------------------------------
// Nav indicator helper
// ------------------------------
function updateNavIndicator() {
	const indicator = document.getElementById('navIndicator');
	const rail = indicator?.parentElement; // grid container
	if (!indicator || !rail) return;
	// prioritize hovered nav button if any
	const hovered = [...rail.querySelectorAll('button')].find(b => b.matches(':hover'));
	const active = document.querySelector('nav [aria-current="page"]');
	const target = hovered || active || document.getElementById('btnNow');
	const railRect = rail.getBoundingClientRect();
	if (!target) {
		indicator.style.width = '0px';
		return;
	}
	const rect = target.getBoundingClientRect();
	// slightly expand lens on hover for magnification feel
	const expand = hovered ? 8 : 2;
	const left = rect.left - railRect.left - expand / 2 + 4;
	const top = rect.top - railRect.top - expand / 2 + 2;
	const width = Math.max(0, rect.width + expand - 8);
	const height = Math.max(0, rect.height + expand - 4);
	indicator.style.left = `${left}px`;
	indicator.style.top = `${top}px`;
	indicator.style.width = `${width}px`;
	indicator.style.height = `${height}px`;
	indicator.style.opacity = hovered ? '1' : '.92';
}

// ------------------------------
// Background ripples (canvas)
// ------------------------------
function startRipples() {
	const canvas = document.getElementById('bgRipples');
	if (!canvas) return () => { };
	const ctx = canvas.getContext('2d', { alpha: true });
	let rafId = null;
	let running = true;

	const state = {
		w: 0,
		h: 0,
		dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
		sparkles: [],
		bubbles: [],
		parallax: { x: 0.5, y: 0.5 },
		sprites: { sparkle: null, bubble: null }
	};

	function resize() {
		const { innerWidth: w, innerHeight: h } = window;
		state.w = w; state.h = h;
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';
		canvas.width = Math.floor(w * state.dpr);
		canvas.height = Math.floor(h * state.dpr);
		ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
		seed();
	}

	function makeSparkleSprite() {
		const s = 64;
		const off = document.createElement('canvas');
		off.width = off.height = s;
		const c = off.getContext('2d');
		const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
		g.addColorStop(0, 'rgba(255,255,255,0.75)');
		g.addColorStop(0.4, 'rgba(180,240,255,0.35)');
		g.addColorStop(1, 'rgba(255,255,255,0)');
		c.fillStyle = g;
		c.beginPath(); c.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); c.fill();
		// cross glints
		c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
		c.beginPath(); c.moveTo(8, s / 2); c.lineTo(s - 8, s / 2); c.stroke();
		c.beginPath(); c.moveTo(s / 2, 8); c.lineTo(s / 2, s - 8); c.stroke();
		return off;
	}

	function makeBubbleSprite() {
		const s = 128;
		const off = document.createElement('canvas');
		off.width = off.height = s;
		const c = off.getContext('2d');
		const g = c.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.48);
		g.addColorStop(0, 'rgba(160,220,255,0.08)');
		g.addColorStop(0.6, 'rgba(120,200,255,0.05)');
		g.addColorStop(1, 'rgba(0,0,0,0)');
		c.fillStyle = g;
		c.beginPath(); c.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2); c.fill();
		// highlight
		c.beginPath();
		c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 2;
		c.arc(s * 0.38, s * 0.38, s * 0.18, Math.PI * 0.2, Math.PI * 1.4);
		c.stroke();
		return off;
	}

	function seed() {
		// counts scale mildly with area
		const areaK = Math.min(1.6, Math.max(0.6, (state.w * state.h) / (1440 * 900)));
		const Ns = Math.round(28 * areaK);
		const Nb = Math.round(12 * areaK);

		if (!state.sprites.sparkle) state.sprites.sparkle = makeSparkleSprite();
		if (!state.sprites.bubble) state.sprites.bubble = makeBubbleSprite();

		state.sparkles = new Array(Ns).fill(0).map(() => {
			const size = 6 + Math.random() * 10;
			return {
				x: Math.random() * state.w,
				y: Math.random() * state.h,
				vx: (Math.random() * 0.4 - 0.2),
				vy: (Math.random() * 0.4 - 0.2),
				size,
				a: 0.08 + Math.random() * 0.12,
				tw: Math.random() * Math.PI * 2
			};
		});

		state.bubbles = new Array(Nb).fill(0).map(() => {
			const r = 30 + Math.random() * 70;
			return {
				x: Math.random() * state.w,
				y: Math.random() * state.h,
				r,
				vy: - (0.08 + Math.random() * 0.2),
				swayA: Math.random() * Math.PI * 2,
				swayV: 0.004 + Math.random() * 0.008,
				swayAmp: 8 + Math.random() * 16,
				a: 0.10 + Math.random() * 0.15
			};
		});
	}

	function step(t) {
		if (!running) return;
		ctx.clearRect(0, 0, state.w, state.h);

		const px = (state.parallax.x - 0.5);
		const py = (state.parallax.y - 0.5);

		// Sparkles (additive blend)
		ctx.globalCompositeOperation = 'lighter';
		for (const s of state.sparkles) {
			s.x += s.vx + px * 0.6;
			s.y += s.vy + py * 0.6;
			s.tw += 0.05;
			const alpha = s.a * (0.6 + 0.4 * Math.sin(s.tw));
			// wrap
			if (s.x < -20) s.x = state.w + 20;
			if (s.x > state.w + 20) s.x = -20;
			if (s.y < -20) s.y = state.h + 20;
			if (s.y > state.h + 20) s.y = -20;
			ctx.globalAlpha = alpha;
			const sz = s.size * (0.9 + 0.2 * Math.sin(s.tw * 0.7));
			ctx.drawImage(state.sprites.sparkle, s.x - sz, s.y - sz, sz * 2, sz * 2);
		}

		// Bubbles (source-over)
		ctx.globalCompositeOperation = 'source-over';
		for (const b of state.bubbles) {
			b.y += b.vy;
			b.swayA += b.swayV;
			const ox = Math.sin(b.swayA) * b.swayAmp + px * 6;
			const oy = py * 6;
			if (b.y + b.r < -10) {
				b.y = state.h + b.r + 10;
				b.x = Math.random() * state.w;
			}
			ctx.globalAlpha = b.a;
			const sz = b.r * 2;
			ctx.drawImage(state.sprites.bubble, b.x + ox - b.r, b.y + oy - b.r, sz, sz);
		}
		ctx.globalAlpha = 1;

		rafId = requestAnimationFrame(step);
	}

	const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	function onPointer(e) {
		const x = Math.max(0, Math.min(1, e.clientX / state.w));
		const y = Math.max(0, Math.min(1, e.clientY / state.h));
		state.parallax.x = x; state.parallax.y = y;
	}

	resize();
	if (!prefersReduced) {
		rafId = requestAnimationFrame(step);
		window.addEventListener('pointermove', onPointer, { passive: true });
	} else {
		// still seed for static frame
		seed();
		step();
	}
	window.addEventListener('resize', resize);

	return () => {
		running = false;
		if (rafId) cancelAnimationFrame(rafId);
		window.removeEventListener('pointermove', onPointer);
		window.removeEventListener('resize', resize);
	};
}
