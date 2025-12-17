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

// Ensure the day dropdown points to today if available (fallback to first option)
function setDaySelectToToday() {
	const select = document.getElementById("daySelect");
	if (!select) return;
	const today = getDayNameFromDate().toLowerCase();
	const options = Array.from(select.options || []);
	const exists = options.find(o => o.value.toLowerCase() === today);
	if (exists) {
		select.value = today;
	} else if (options.length) {
		// fallback (e.g., Sunday not present)
		select.value = options[0].value;
	}
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

// Get upcoming classes for the rest of the day up to a cutoff (default 17:30)
function getUpcomingClasses(dayName, minutes, cutoff = 17 * 60 + 30) {
	if (!TIMETABLE) return [];
	const key = dayName.toLowerCase();
	const dayArr = TIMETABLE[key];
	if (!Array.isArray(dayArr)) return [];
	const out = [];
	for (const item of dayArr) {
		const { start } = parseRange(item.time);
		const subj = (item.subject || '').trim().toLowerCase();
		const isReal = subj && subj !== '-' && subj !== '—' && !subj.includes('no class') && !subj.includes('free');
		if (isReal && start > minutes && start <= cutoff) out.push({ ...item, start });
	}
	out.sort((a, b) => a.start - b.start);
	return out;
}

// Find the next slot after the current time and determine if a class exists there
function getNextClassInfo(dayName, minutes) {
	if (!TIMETABLE) return { type: 'none' };
	const key = dayName.toLowerCase();
	const list = TIMETABLE[key];
	if (!Array.isArray(list)) return { type: 'none' };
	let nextSlot = null, nextStart = null;
	for (const slot of SLOTS) {
		const { start } = parseRange(slot);
		if (start > minutes) { nextSlot = slot; nextStart = start; break; }
	}
	if (!nextSlot) return { type: 'none' };
	const match = list.find(x => x.time === nextSlot);
	if (!match) return { type: 'free', start: nextStart, slot: nextSlot };
	const subj = (match.subject || '').trim().toLowerCase();
	if (subj === '-' || subj === '—' || subj.includes('no class')) {
		return { type: 'free', start: nextStart, slot: nextSlot };
	}
	return { type: 'class', start: nextStart, slot: nextSlot, item: match };
}

function formatDelta(mins) {
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	if (h && m) return `${h}h ${m}m`;
	if (h) return `${h}h`;
	return `${m}m`;
}

// Get the end time (in minutes) of the last real class today; returns null if none
function getTodayLastClassEnd(dayName) {
	if (!TIMETABLE) return null;
	const key = dayName.toLowerCase();
	const list = TIMETABLE[key];
	if (!Array.isArray(list) || !list.length) return null;
	let last = null;
	for (const item of list) {
		const subj = (item.subject || '').trim().toLowerCase();
		if (subj && subj !== '-' && subj !== '—' && !subj.includes('no class')) {
			const { end } = parseRange(item.time);
			if (last == null || end > last) last = end;
		}
	}
	return last;
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
		// Badge row with next info
		const nextInfo = getNextClassInfo(dayName, minutes);
		const rowTop = h('div', 'flex items-center justify-between');
		rowTop.append(h('div', 'text-sm text-gray-500', `${dayName}`));
		const badge = h('span', 'ml-2 badge');
		if (nextInfo.type === 'class') {
			const delta = Math.max(0, nextInfo.start - minutes);
			badge.classList.add('badge-primary');
			badge.textContent = `Next in ${formatDelta(delta)}`;
		} else if (nextInfo.type === 'free' || nextInfo.type === 'none') {
			badge.classList.add('badge-neutral');
			badge.textContent = 'No class next';
		}
		rowTop.append(badge);
		card.append(rowTop);
		if (current) {
			card.append(
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

	const wrap = h("div", "space-y-3");
	if (content) wrap.append(h("p", "text-sm text-gray-600 dark:text-gray-400", content));

	// Upcoming card with smart end-of-day detection + 17:30 fallback
	const cutoff = 17 * 60 + 30;
	if (TIMETABLE && TIMETABLE[dayName.toLowerCase()]) {
		// If it's after 17:30, always done for the day
		if (minutes >= cutoff) {
			const doneCard = h(
				"div",
				"rounded-2xl p-4 shadow-sm transition-all duration-300 ease-out bg-white/90 border border-gray-200 dark:bg-slate-800/90 dark:border-gray-700"
			);
			doneCard.append(
				h("div", "text-sm font-semibold mb-1", "All done for today"),
				h("p", "text-sm text-gray-600 dark:text-gray-300", "No more classes — enjoy your day!")
			);
			wrap.append(doneCard);
		} else {
			const lastEnd = getTodayLastClassEnd(dayName);
			if (lastEnd == null || minutes >= lastEnd) {
				const doneCard = h(
					"div",
					"rounded-2xl p-4 shadow-sm transition-all duration-300 ease-out bg-white/90 border border-gray-200 dark:bg-slate-800/90 dark:border-gray-700"
				);
				doneCard.append(
					h("div", "text-sm font-semibold mb-1", lastEnd == null ? "No classes today" : "All done for today"),
					h("p", "text-sm text-gray-600 dark:text-gray-300", "No more classes — enjoy your day!")
				);
				wrap.append(doneCard);
			} else {
				const until = Math.min(cutoff, lastEnd);
				const upcoming = getUpcomingClasses(dayName, minutes, until);
				if (upcoming.length === 0) {
					const doneCard = h(
						"div",
						"rounded-2xl p-4 shadow-sm transition-all duration-300 ease-out bg-white/90 border border-gray-200 dark:bg-slate-800/90 dark:border-gray-700"
					);
					doneCard.append(
						h("div", "text-sm font-semibold mb-1", "All done for today"),
						h("p", "text-sm text-gray-600 dark:text-gray-300", "No more classes — enjoy your day!")
					);
					wrap.append(doneCard);
				} else {
					const upCard = h(
						"div",
						"rounded-2xl p-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out bg-white/90 border border-gray-200 dark:bg-slate-800/90 dark:border-gray-700"
					);
					upCard.append(h("div", "text-sm font-semibold mb-2", "Upcoming Today"));
					const ul = h("ul", "space-y-2");
					for (const item of upcoming) {
						const li = h(
							"li",
							"flex items-center justify-between gap-3 p-2 rounded-xl bg-white/70 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700"
						);
						const left = h("div");
						left.append(
							h("div", "text-sm font-medium", item.subject),
							h("div", "text-xs text-gray-500 dark:text-gray-400", `${item.room} • ${item.faculty}`)
						);
						const right = h("div", "text-xs font-mono text-gray-600 dark:text-gray-300 shrink-0", item.time);
						li.append(left, right);
						ul.append(li);
					}
					upCard.append(ul);
					wrap.append(upCard);
				}
			}
		}
	}

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
				li.style.borderColor = 'var(--accent-primary)';
				li.style.boxShadow = '0 0 15px var(--accent-glow)';
				li.style.background = 'var(--accent-glow)';
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

// Track current view for directional transitions
let currentViewIndex = 0;
const viewOrder = ["nowView", "dailyView", "weeklyView"];

function showView(targetId) {
	const ids = ["nowView", "dailyView", "weeklyView"];
	const targetIndex = viewOrder.indexOf(targetId);
	const direction = targetIndex > currentViewIndex ? 'left' : 'right';
	
	for (const id of ids) {
		const el = document.getElementById(id);
		if (!el) continue;
		
		// Remove any existing animation classes
		el.classList.remove(
			'view-entering', 'view-exiting',
			'view-slide-left', 'view-slide-right',
			'view-exit-left', 'view-exit-right'
		);
		
		if (id === targetId) {
			el.classList.remove("hidden");
			el.classList.remove("opacity-0");
			
			// Apply directional entrance animation
			requestAnimationFrame(() => {
				el.classList.add("opacity-100");
				if (direction === 'left') {
					el.classList.add('view-slide-left');
				} else {
					el.classList.add('view-slide-right');
				}
			});
		} else if (!el.classList.contains("hidden")) {
			// Apply exit animation to currently visible view
			el.classList.remove("opacity-100");
			
			if (direction === 'left') {
				el.classList.add('view-exit-left');
			} else {
				el.classList.add('view-exit-right');
			}
			
			setTimeout(() => {
				el.classList.add("hidden");
				el.classList.add("opacity-0");
				el.classList.remove('view-exit-left', 'view-exit-right');
			}, 350);
		}
	}
	
	currentViewIndex = targetIndex;

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
			btn.classList.add("active"); // Support new class
			btn.classList.add("is-active"); // Support legacy class
			btn.setAttribute("aria-current", "page");
		} else {
			btn.classList.remove("active");
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
		setDaySelectToToday();
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

	// Preselect today's day in dropdown before loading data
	setDaySelectToToday();
	await loadTimetable();

	// Initial render: Now view
	showView("nowView");
	renderNowView();

	// Pre-render other views to avoid blank on first switch (Daily uses the preselected today)
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
			
			// Premium theme transition effect
			performPremiumThemeTransition(isDark, e.target);
			
			try { localStorage.setItem("timetable-theme", isDark ? "dark" : "light"); } catch { }
		});
	}

	// Start background animation once
	startRipples();
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

// Premium theme transition with ripple and glow effects
function performPremiumThemeTransition(isDark, toggleElement) {
	// Get toggle position for ripple origin
	const rect = toggleElement.getBoundingClientRect();
	const centerX = rect.left + rect.width / 2;
	const centerY = rect.top + rect.height / 2;
	
	// Calculate ripple size (needs to cover entire viewport)
	const maxDimension = Math.max(
		Math.hypot(centerX, centerY),
		Math.hypot(window.innerWidth - centerX, centerY),
		Math.hypot(centerX, window.innerHeight - centerY),
		Math.hypot(window.innerWidth - centerX, window.innerHeight - centerY)
	);
	
	// Create glow effect
	const glow = document.createElement('div');
	glow.className = 'theme-glow';
	glow.style.setProperty('--glow-x', `${(centerX / window.innerWidth) * 100}%`);
	glow.style.setProperty('--glow-y', `${(centerY / window.innerHeight) * 100}%`);
	document.body.appendChild(glow);
	
	// Create ripple
	const ripple = document.createElement('div');
	ripple.className = 'theme-ripple';
	ripple.style.width = ripple.style.height = `${maxDimension}px`;
	ripple.style.left = `${centerX - maxDimension / 2}px`;
	ripple.style.top = `${centerY - maxDimension / 2}px`;
	ripple.style.background = isDark 
		? 'radial-gradient(circle, rgba(6, 182, 212, 0.3) 0%, transparent 70%)'
		: 'radial-gradient(circle, rgba(14, 165, 233, 0.25) 0%, transparent 70%)';
	document.body.appendChild(ripple);
	
	// Create morph overlay
	const overlay = document.createElement('div');
	overlay.className = 'theme-morph-overlay';
	document.body.appendChild(overlay);
	
	// Add transitioning class for staggered children
	document.body.classList.add('theme-transitioning');
	
	// Trigger animations
	requestAnimationFrame(() => {
		glow.classList.add('pulse');
		ripple.classList.add('expanding');
		overlay.classList.add('active');
		
		// Apply theme change after a short delay for visual effect
		setTimeout(() => {
			document.documentElement.classList.toggle("dark", isDark);
		}, 150);
	});
	
	// Cleanup
	setTimeout(() => {
		glow.remove();
		ripple.remove();
		overlay.remove();
		document.body.classList.remove('theme-transitioning');
	}, 800);
}

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
// Background Network Animation (canvas)
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
		points: [],
		target: { x: 0, y: 0 },
	};

	function resize() {
		const { innerWidth: w, innerHeight: h } = window;
		state.w = w; state.h = h;
		canvas.width = w;
		canvas.height = h;
		initPoints();
	}

	function initPoints() {
		const count = Math.floor((state.w * state.h) / 15000); // Sparse density
		state.points = [];
		for (let i = 0; i < count; i++) {
			state.points.push({
				x: Math.random() * state.w,
				y: Math.random() * state.h,
				vx: (Math.random() - 0.5) * 0.2, // Slower, smoother movement
				vy: (Math.random() - 0.5) * 0.2,
				size: Math.random() * 1.5 + 0.5 // Smaller, finer particles
			});
		}
	}

	function step() {
		if (!running) return;
		
		const isDark = document.documentElement.classList.contains('dark');
		ctx.clearRect(0, 0, state.w, state.h);

		// Theme-aware colors - Sleek & Subtle
		const pointColor = isDark ? 'rgba(6, 182, 212, 0.3)' : 'rgba(14, 165, 233, 0.25)'; 
		const lineColor = isDark ? 'rgba(6, 182, 212, 0.08)' : 'rgba(14, 165, 233, 0.08)';

		ctx.fillStyle = pointColor;
		ctx.strokeStyle = lineColor;
		ctx.lineWidth = 1;

		for (let i = 0; i < state.points.length; i++) {
			const p = state.points[i];
			
			// Move
			p.x += p.vx;
			p.y += p.vy;

			// Bounce
			if (p.x < 0 || p.x > state.w) p.vx *= -1;
			if (p.y < 0 || p.y > state.h) p.vy *= -1;

			// Draw point
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
			ctx.fill();

			// Connect
			for (let j = i + 1; j < state.points.length; j++) {
				const p2 = state.points[j];
				const dx = p.x - p2.x;
				const dy = p.y - p2.y;
				const dist = dx * dx + dy * dy;

				if (dist < 20000) { // Connection distance
					ctx.beginPath();
					ctx.moveTo(p.x, p.y);
					ctx.lineTo(p2.x, p2.y);
					ctx.stroke();
				}
			}
		}

		rafId = requestAnimationFrame(step);
	}

	resize();
	rafId = requestAnimationFrame(step);
	window.addEventListener('resize', resize);

	return () => {
		running = false;
		if (rafId) cancelAnimationFrame(rafId);
		window.removeEventListener('resize', resize);
	};
}

