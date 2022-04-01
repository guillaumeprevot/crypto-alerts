// Register service worker to control making site work offline
if ('serviceWorker' in navigator) {
	navigator.serviceWorker
		.register('/sw.js')
		.then(() => console.log('Service Worker registered'));
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
	console.log('PWA installation completed');
});

if (! window.navigator.vibrate) {
	alert('Vibration API is not supported');
} else {
	document.querySelectorAll('.vibrate').forEach((e) => e.style.display = 'inline')

	document.querySelector('.vibrate-single').addEventListener('click', (e) => {
		window.navigator.vibrate(3000);
	})

	document.querySelector('.vibrate-pattern').addEventListener('click', (e) => {
		window.navigator.vibrate([1000, 100, 1000, 100, 1000]);
	})

	document.querySelector('.vibrate-off').addEventListener('click', (e) => {
		window.navigator.vibrate(0);
	})
}

// Notifications
const notifyPermission = document.querySelector('.notify-permission');
const notifyClient = document.querySelector('.notify-client');
const notifySW = document.querySelector('.notify-sw');
const notifyClicked = document.querySelector('.notify-clicked');
notifyClicked.style.display = 'none';
if (Notification.permission === 'granted') {
	notifyPermission.style.display = 'none';
} else {
	notifyClient.style.display = 'none';
	notifySW.style.display = 'none';
}
notifyPermission.addEventListener('click', (e) => {
	Notification.requestPermission(function(result) {
		if (result === 'granted') {
			notifyClient.style.display = '';
			notifySW.style.display = '';
			notifyPermission.style.display = 'none';
		}
	});
})
notifyClient.addEventListener('click', (e) => {
	Notification.requestPermission(function(result) {
		if (result === 'granted') {
			navigator.serviceWorker.ready.then(function(registration) {
				registration.showNotification('Notify from HTML', {
					body: 'Buzz! Buzz!',
					icon: '/icons/icon-192.png',
					vibrate: [200, 100, 200, 100, 200, 100, 200],
					tag: 'vibration-sample'
				});
			});
		}
	});
})
notifySW.addEventListener('click', (e) => {
	Notification.requestPermission(function(result) {
		if (result === 'granted') {
			navigator.serviceWorker.ready.then(function(registration) {
				registration.active.postMessage('notify');
			});
		}
	});
})
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.addEventListener('message', (e) => {
		if (e.data === 'notificationclick') {
			notifyClicked.style.display = '';
			setTimeout(() => {
				notifyClicked.style.display = 'none';
			}, 3000);
		} else if (e.data && e.data.type === 'push') {
			let ul = document.getElementById('push-alerts');
			let a = e.data.activation;
			ul.innerHTML += '<li>' + a.symbol + ' = ' + a.price + '</li>'
		}
	})
}

// Push notifications
if (navigator.serviceWorker) {
	let pushRegisterButton = document.getElementById('push-register');
	let pushUnregisterButton = document.getElementById('push-unregister');
	let pushTestButton = document.getElementById('push-test');

	function setRegistered() {
		pushRegisterButton.style.display = 'none';
		pushUnregisterButton.style.display = '';
	}

	function setUnregistered() {
		pushRegisterButton.style.display = '';
		pushUnregisterButton.style.display = 'none';
	}

	navigator.serviceWorker.ready
		.then((registration) => registration.pushManager.getSubscription())
		.then((subscription) => subscription ? setRegistered() : setUnregistered());

	pushRegisterButton.addEventListener('click', (e) => {
		navigator.serviceWorker.ready.then(async function(registration) {
			// Get the server's public key
			const response = await fetch('/subscription/key');
			const vapidPublicKey = await response.text();
			// Subscribe the user
			return registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: vapidPublicKey
			});
		}).then(function(subscription) {
			console.log('Subscribed to push notifications');
			return fetch('/subscription/register', {
				method: 'post',
				headers: {
					'Content-type': 'application/json'
				},
				body: JSON.stringify({
					subscription: subscription
				})
			});
		}).then(setRegistered);
	});

	pushUnregisterButton.addEventListener('click', (e) => {
		navigator.serviceWorker.ready.then(function(registration) {
			return registration.pushManager.getSubscription();
		}).then(function(subscription) {
			return subscription.unsubscribe().then(function() {
				console.log('Unsubscribed from push notifications');
				return fetch('/subscription/unregister', {
					method: 'post',
					headers: {
						'Content-type': 'application/json'
					},
					body: JSON.stringify({
						subscription: subscription
					})
				});
			});
		}).then(setUnregistered);
	});

	pushTestButton.addEventListener('click', (e) => {
		fetch('/subscription/test').then(() => {
			pushTestButton.style.display = 'none';
		});
	});
}
