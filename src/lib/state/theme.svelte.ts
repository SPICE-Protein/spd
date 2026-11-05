/**
 * Theme choice — light / dark / system. The class lands on <html> because
 * every token in app.css hangs off `.dark`; the choice persists in
 * localStorage and app.html replays it BEFORE first paint, so a dark-mode
 * visitor never gets a white flash on load.
 *
 * 'system' tracks prefers-color-scheme live: flipping the OS theme moves
 * the site without a reload. The choice is a browser-local preference —
 * it is never uploaded, same as the rest of /settings.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'spd_theme';

function read(): ThemeChoice {
	if (typeof localStorage === 'undefined') return 'system';
	const v = localStorage.getItem(KEY);
	return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

class ThemeState {
	choice = $state<ThemeChoice>('system');
	systemDark = $state(typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
	effective = $derived(this.choice === 'system' ? (this.systemDark ? 'dark' : 'light') : this.choice);

	constructor() {
		if (typeof window === 'undefined') return;
		this.choice = read();
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		mq.addEventListener('change', (e) => (this.systemDark = e.matches));
		// module-level effects need an explicit root (no component owns them)
		$effect.root(() => {
			$effect(() => {
				document.documentElement.classList.toggle('dark', this.effective === 'dark');
			});
		});
	}

	set(choice: ThemeChoice) {
		this.choice = choice;
		if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, choice);
	}
}

export const theme = new ThemeState();
