// Register service worker to control making site work offline
if ('serviceWorker' in navigator) {
	navigator.serviceWorker
		.register('/sw.js')
		.then(() => { console.log('Service Worker Registered'); });
}

// Code to handle install prompt on desktop
let deferredPrompt;
const installBtn = document.querySelector('.install-button');
installBtn.style.display = 'none';

window.addEventListener('beforeinstallprompt', (e) => {
	// Prevent the installation prompt for now
	e.preventDefault();
	// Stash the event so it can be triggered later
	deferredPrompt = e;
	// Update UI to notify the user they can install the PWA
	installBtn.style.display = 'block';

	installBtn.addEventListener('click', () => {
		// Hide our UI allowing the user to install the PWA
		installBtn.style.display = 'none';
		// Show the installation prompt using previously fired event
		deferredPrompt.prompt();
		// Wait for the user to respond to the prompt
		deferredPrompt.userChoice.then((choiceResult) => {
			const accepted = choiceResult.outcome === 'accepted';
			console.log(accepted ? 'PWA installation accepted' : 'PWA installation dismissed');
			deferredPrompt = null;
		});
	});
});

window.addEventListener('appinstalled', (e) => {
	console.log('Application installed');
});
