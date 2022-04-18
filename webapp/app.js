// Service Worker is required
if (! ('serviceWorker' in navigator)) {
	document.body.textContent = 'Service Worker support is required.'
	throw new Error('Service Worker support is required.');
}

// Register service worker (cache and push notifications)
navigator.serviceWorker.register('/sw.js')
	.then(() => console.log('Service Worker registered'));

// UTILS

// transforms a timestamp into a string suitable for a datetime-local input's value
function timestampToDatetimeLocalValue(ts) {
	let d = new Date(ts);
	d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
	return d.toISOString().slice(0, 16);
}

// transforms a string suitable for a datetime-local input's value into a timestamp
function datetimeLocalValueToTimestamp(v) {
	let s = v.substring(0, 16) + ':00Z';
	let d = new Date(s);
	d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
	return d.getTime();
}

// makes a POST request to this URL with JSON body encoded from data
function postJSON(url, data) {
	return fetch(url, {
		method: 'post',
		headers: { 'Content-type': 'application/json' },
		body: JSON.stringify(data)
	});
}

// STEP 1 : PWA installation prompt
function configurePWAInstallationPrompt() {
	let installButton = document.getElementById('install-button');
	let installPrompt;

	// Hide button by default
	installButton.style.display = 'none';

	window.addEventListener('beforeinstallprompt', (e) => {
		// Prevent the installation prompt for now
		e.preventDefault();
		// Stash the event so it can be triggered later
		installPrompt = e;
		// Update UI to notify the user they can install the PWA
		installButton.style.display = '';
	});

	installButton.addEventListener('click', () => {
		// Hide our UI allowing the user to install the PWA
		installButton.style.display = 'none';
		// Show the installation prompt using previously fired event
		installPrompt.prompt();
		// Wait for the user to respond to the prompt
		installPrompt.userChoice.then((choiceResult) => {
			const accepted = choiceResult.outcome === 'accepted';
			console.log(accepted ? 'PWA installation accepted' : 'PWA installation dismissed');
			installPrompt = null;
		});
	});

	window.addEventListener('appinstalled', (e) => {
		console.log('PWA installation completed');
	});
}

// STEP 2 : PUSH notification subscription
function configurePushNotificationSubscription() {
	let subscribeButton = document.getElementById('subscribe-button');
	let unsubscribeButton = document.getElementById('unsubscribe-button');

	function setRegistered() {
		subscribeButton.style.display = 'none';
		unsubscribeButton.style.display = '';
	}

	function setUnregistered() {
		subscribeButton.style.display = '';
		unsubscribeButton.style.display = 'none';
	}

	navigator.serviceWorker.ready
		.then((registration) => registration.pushManager.getSubscription())
		.then((subscription) => subscription ? setRegistered() : setUnregistered());

	subscribeButton.addEventListener('click', (e) => {
		navigator.serviceWorker.ready.then(async function(registration) {
			// Get the server's public key
			const vapidPublicKeyResponse = await fetch('/subscription/key');
			const vapidPublicKey = await vapidPublicKeyResponse.text();
			// Subscribe the user
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: vapidPublicKey
			});
			// Register on the server-side
			const registerResponse = await postJSON('/subscription/register', { subscription: subscription });
			// Done
			console.log('Subscribed to push notifications');
			setRegistered();
		});
	});

	unsubscribeButton.addEventListener('click', (e) => {
		navigator.serviceWorker.ready.then(async function(registration) {
			// Get current subscription
			const subscription = await registration.pushManager.getSubscription();
			// Unsubscribe the user
			const unsubscribed = await subscription.unsubscribe();
			// Register on the server-side
			const unregisterResponse = await postJSON('/subscription/unregister', { subscription: subscription });
			// Done
			console.log('Unsubscribed from push notifications');
			setUnregistered();
		});
	});
}

$(function() {
	"use strict";

	configurePWAInstallationPrompt();
	configurePushNotificationSubscription();

	let alerts = []; // le tableau des alertes
	let cryptos; // le tableaux des cryptos disponibles

	let startButton = $('#start-button');
	let alertList = $('#alert-list');
	let addButton = $('#add-button');
	let clearButton = $('#clear-button');

	let alertModal = $('#alert-modal');
	let alertModalInstance = new bootstrap.Modal(alertModal[0]);
	let cryptoInput = $('#crypto-input');
	let cryptoList = $('#crypto-list');
	let operatorSelect = $('#operator-select');
	let thresholdInput = $('#threshold-input');
	let expirationInput = $('#expiration-input');
	let notificationCheckbox = $('#notification-checkbox');
	let vibrationCheckbox = $('#vibration-checkbox');
	let alertDeleteButton = $('#alert-delete-button');
	let alertValidateButton = $('#alert-validate-button');

	let clearConfirmModal = $('#clear-confirm-modal');
	let clearConfirmModalInstance = new bootstrap.Modal(clearConfirmModal[0]);
	let clearConfirmButton = $('#clear-confirm-button');

	function showAlert(alert) {
		let option = operatorSelect.children(`[value=${alert.operator}]`);
		$('<a href="#" class="list-group-item list-group-item-action p-3"></a>')
			.data('alert', alert)
			.html(`<b>${alert.symbol}</b> ${option.text()} <b>${alert.threshold}</b>`)
			.appendTo(alertList);
	}

	startButton.on('click', () => addButton.click());

	addButton.on('click', () => {
		alertModal.data('alert', {});
		cryptoInput.val('').removeData('symbol');
		cryptoList.empty();
		operatorSelect.val('higher');
		thresholdInput.val('');
		expirationInput.val('');
		vibrationCheckbox.prop('checked', false);
		notificationCheckbox.prop('checked', false);
		alertDeleteButton.hide();
		alertModalInstance.show();
	});

	alertList.on('click', 'a.list-group-item', (event) => {
		let alert = $(event.target).closest('a').data('alert');
		alertModal.data('alert', alert);
		cryptoInput.val(alert.symbol).data('symbol', alert.symbol);
		cryptoList.empty();
		operatorSelect.val(alert.operator);
		thresholdInput.val(alert.threshold ? alert.threshold.toString() : '');
		expirationInput.val(alert.expiration ? timestampToDatetimeLocalValue(alert.expiration) : '');
		vibrationCheckbox.prop('checked', !!alert.vibration);
		notificationCheckbox.prop('checked', !!alert.notification);
		alertDeleteButton.show();
		alertModalInstance.show();
		return false;
	});

	alertValidateButton.on('click', () => {
		// Check correct crypto selection
		let symbol = cryptoInput.data('symbol');
		cryptoInput.toggleClass('is-invalid', !symbol);
		if (!symbol)
			return;

		// Check valid threshold selection
		let thresholdString = thresholdInput.val();
		thresholdInput.toggleClass('is-invalid', !thresholdString);
		if (!thresholdString)
			return;

		// Transform expiration to a timestamp
		let expirationString = expirationInput.val();
		let expiration = expirationString ? datetimeLocalValueToTimestamp(expirationString) : undefined;

		// Update model
		let alert = alertModal.data('alert');
		alert.symbol = symbol;
		alert.operator = operatorSelect.val();
		alert.threshold = Number.parseFloat(thresholdString);
		alert.expiration = expiration;
		alert.vibration = vibrationCheckbox.prop('checked');
		alert.notification = notificationCheckbox.prop('checked');

		// Dismiss modal
		alertModalInstance.hide();

		if (!alert.uuid) {
			// Add
			postJSON('/alert/add', alert).then((response) => response.text()).then((uuid) => {
				alert.uuid = uuid;
				alerts.push(alert);
				// Update view
				startButton.hide();
				alertList.show();
				showAlert(alert);
			});
		} else {
			// Update
			postJSON('/alert/update', alert).then(() => {
				// Update view
				let index = alerts.indexOf(alert);
				let option = operatorSelect.children(':selected');
				$(alertList.children('a').get(index)).html(`<b>${alert.symbol}</b> ${option.text()} <b>${alert.threshold}</b>`)
			});
		}
	});

	alertDeleteButton.on('click', () => {
		// Delete
		let alert = alertModal.data('alert');
		if (!alert.uuid)
			throw new Error('le bouton ne devrait pas être visible');
		postJSON('/alert/delete', [alert.uuid]).then(() => {
			// Update model
			let index = alerts.indexOf(alert);
			alerts.splice(index, 1);
			// Update view
			$(alertList.children('a').get(index)).remove();
			if (alerts.length === 0) {
				startButton.show();
				alertList.hide();
			}
			// Dismiss modal
			alertModalInstance.hide();
		});
	});

	clearButton.on('click', () => {
		clearConfirmModalInstance.show();
	});

	clearConfirmButton.on('click', () => {
		// Clear
		let uuids = alerts.map((a) => a.uuid);
		postJSON('/alert/delete', uuids).then(() => {
			// Update model
			alerts.length = 0;
			// Update view
			alertList.children('a').remove();
			startButton.show();
			alertList.hide();
			clearConfirmModalInstance.hide();
		});
	});

	cryptoInput.on('input', () => {
		let text = (cryptoInput.val() ||'').toLowerCase();
		cryptoList.empty();
		cryptoInput.removeData('symbol');
		if (! text)
			return;
		let count = 5; // autocomplete with 5 results max
		cryptos.forEach((crypto) => {
			if (count === 0)
				return;
			let ok = crypto.name.toLowerCase().includes(text) || crypto.symbol.toLowerCase().includes(text);
			if (! ok)
				return;
			count--;
			$('<li class="list-group-item"></li>')
				.append($('<img style="width:24px; margin-right: 10px; " />').attr('src', crypto.logo))
				.append($('<span />').text(crypto.name))
				.data('crypto', crypto)
				.appendTo(cryptoList);
		});
	});

	cryptoList.on('click', 'li', (event) => {
		let li = $(event.target).closest('li').toggleClass('active'),
			crypto = li.data('crypto');
		li.siblings().remove().end();
		cryptoInput.val(crypto.symbol)
			.data('symbol', crypto.symbol)
			.removeClass('is-invalid');
	});

	fetch('/alert/list').then((response) => response.json()).then((data) => {
		alerts = data;
		startButton.toggle(alerts.length === 0);
		alertList.toggle(alerts.length > 0);
		if (alerts.length > 0)
			alerts.forEach(showAlert);

		return $.get('/cryptos.json').then((data) => {
			cryptos = data;
		});
	});

});
