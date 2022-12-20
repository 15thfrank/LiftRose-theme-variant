;(function () {
	'use strict';

	/**
	 * @preserve FastClick: polyfill to remove click delays on browsers with touch UIs.
	 *
	 * @codingstandard ftlabs-jsv2
	 * @copyright The Financial Times Limited [All Rights Reserved]
	 * @license MIT License (see LICENSE.txt)
	 */

	/*jslint browser:true, node:true*/
	/*global define, Event, Node*/


	/**
	 * Instantiate fast-clicking listeners on the specified layer.
	 *
	 * @constructor
	 * @param {Element} layer The layer to listen on
	 * @param {Object} [options={}] The options to override the defaults
	 */
	function FastClick(layer, options) {
		var oldOnClick;

		options = options || {};

		/**
		 * Whether a click is currently being tracked.
		 *
		 * @type boolean
		 */
		this.trackingClick = false;


		/**
		 * Timestamp for when click tracking started.
		 *
		 * @type number
		 */
		this.trackingClickStart = 0;


		/**
		 * The element being tracked for a click.
		 *
		 * @type EventTarget
		 */
		this.targetElement = null;


		/**
		 * X-coordinate of touch start event.
		 *
		 * @type number
		 */
		this.touchStartX = 0;


		/**
		 * Y-coordinate of touch start event.
		 *
		 * @type number
		 */
		this.touchStartY = 0;


		/**
		 * ID of the last touch, retrieved from Touch.identifier.
		 *
		 * @type number
		 */
		this.lastTouchIdentifier = 0;


		/**
		 * Touchmove boundary, beyond which a click will be cancelled.
		 *
		 * @type number
		 */
		this.touchBoundary = options.touchBoundary || 10;


		/**
		 * The FastClick layer.
		 *
		 * @type Element
		 */
		this.layer = layer;

		/**
		 * The minimum time between tap(touchstart and touchend) events
		 *
		 * @type number
		 */
		this.tapDelay = options.tapDelay || 200;

		/**
		 * The maximum time for a tap
		 *
		 * @type number
		 */
		this.tapTimeout = options.tapTimeout || 700;

		if (FastClick.notNeeded(layer)) {
			return;
		}

		// Some old versions of Android don't have Function.prototype.bind
		function bind(method, context) {
			return function() { return method.apply(context, arguments); };
		}


		var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
		var context = this;
		for (var i = 0, l = methods.length; i < l; i++) {
			context[methods[i]] = bind(context[methods[i]], context);
		}

		// Set up event handlers as required
		if (deviceIsAndroid) {
			layer.addEventListener('mouseover', this.onMouse, true);
			layer.addEventListener('mousedown', this.onMouse, true);
			layer.addEventListener('mouseup', this.onMouse, true);
		}

		layer.addEventListener('click', this.onClick, true);
		layer.addEventListener('touchstart', this.onTouchStart, false);
		layer.addEventListener('touchmove', this.onTouchMove, false);
		layer.addEventListener('touchend', this.onTouchEnd, false);
		layer.addEventListener('touchcancel', this.onTouchCancel, false);

		// Hack is required for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
		// which is how FastClick normally stops click events bubbling to callbacks registered on the FastClick
		// layer when they are cancelled.
		if (!Event.prototype.stopImmediatePropagation) {
			layer.removeEventListener = function(type, callback, capture) {
				var rmv = Node.prototype.removeEventListener;
				if (type === 'click') {
					rmv.call(layer, type, callback.hijacked || callback, capture);
				} else {
					rmv.call(layer, type, callback, capture);
				}
			};

			layer.addEventListener = function(type, callback, capture) {
				var adv = Node.prototype.addEventListener;
				if (type === 'click') {
					adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
						if (!event.propagationStopped) {
							callback(event);
						}
					}), capture);
				} else {
					adv.call(layer, type, callback, capture);
				}
			};
		}

		// If a handler is already declared in the element's onclick attribute, it will be fired before
		// FastClick's onClick handler. Fix this by pulling out the user-defined handler function and
		// adding it as listener.
		if (typeof layer.onclick === 'function') {

			// Android browser on at least 3.2 requires a new reference to the function in layer.onclick
			// - the old one won't work if passed to addEventListener directly.
			oldOnClick = layer.onclick;
			layer.addEventListener('click', function(event) {
				oldOnClick(event);
			}, false);
			layer.onclick = null;
		}
	}

	/**
	* Windows Phone 8.1 fakes user agent string to look like Android and iPhone.
	*
	* @type boolean
	*/
	var deviceIsWindowsPhone = navigator.userAgent.indexOf("Windows Phone") >= 0;

	/**
	 * Android requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0 && !deviceIsWindowsPhone;


	/**
	 * iOS requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent) && !deviceIsWindowsPhone;


	/**
	 * iOS 4 requires an exception for select elements.
	 *
	 * @type boolean
	 */
	var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


	/**
	 * iOS 6.0-7.* requires the target element to be manually derived
	 *
	 * @type boolean
	 */
	var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS [6-7]_\d/).test(navigator.userAgent);

	/**
	 * BlackBerry requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;

	/**
	 * Determine whether a given element requires a native click.
	 *
	 * @param {EventTarget|Element} target Target DOM element
	 * @returns {boolean} Returns true if the element needs a native click
	 */
	FastClick.prototype.needsClick = function(target) {
		switch (target.nodeName.toLowerCase()) {

		// Don't send a synthetic click to disabled inputs (issue #62)
		case 'button':
		case 'select':
		case 'textarea':
			if (target.disabled) {
				return true;
			}

			break;
		case 'input':

			// File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
			if ((deviceIsIOS && target.type === 'file') || target.disabled) {
				return true;
			}

			break;
		case 'label':
		case 'iframe': // iOS8 homescreen apps can prevent events bubbling into frames
		case 'video':
			return true;
		}

		return (/\bneedsclick\b/).test(target.className);
	};


	/**
	 * Determine whether a given element requires a call to focus to simulate click into element.
	 *
	 * @param {EventTarget|Element} target Target DOM element
	 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
	 */
	FastClick.prototype.needsFocus = function(target) {
		switch (target.nodeName.toLowerCase()) {
		case 'textarea':
			return true;
		case 'select':
			return !deviceIsAndroid;
		case 'input':
			switch (target.type) {
			case 'button':
			case 'checkbox':
			case 'file':
			case 'image':
			case 'radio':
			case 'submit':
				return false;
			}

			// No point in attempting to focus disabled inputs
			return !target.disabled && !target.readOnly;
		default:
			return (/\bneedsfocus\b/).test(target.className);
		}
	};


	/**
	 * Send a click event to the specified element.
	 *
	 * @param {EventTarget|Element} targetElement
	 * @param {Event} event
	 */
	FastClick.prototype.sendClick = function(targetElement, event) {
		var clickEvent, touch;

		// On some Android devices activeElement needs to be blurred otherwise the synthetic click will have no effect (#24)
		if (document.activeElement && document.activeElement !== targetElement) {
			document.activeElement.blur();
		}

		touch = event.changedTouches[0];

		// Synthesise a click event, with an extra attribute so it can be tracked
		clickEvent = document.createEvent('MouseEvents');
		clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
		clickEvent.forwardedTouchEvent = true;
		targetElement.dispatchEvent(clickEvent);
	};

	FastClick.prototype.determineEventType = function(targetElement) {

		//Issue #159: Android Chrome Select Box does not open with a synthetic click event
		if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
			return 'mousedown';
		}

		return 'click';
	};


	/**
	 * @param {EventTarget|Element} targetElement
	 */
	FastClick.prototype.focus = function(targetElement) {
		var length;

		// Issue #160: on iOS 7, some input elements (e.g. date datetime month) throw a vague TypeError on setSelectionRange. These elements don't have an integer value for the selectionStart and selectionEnd properties, but unfortunately that can't be used for detection because accessing the properties also throws a TypeError. Just check the type instead. Filed as Apple bug #15122724.
		if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time' && targetElement.type !== 'month') {
			length = targetElement.value.length;
			targetElement.setSelectionRange(length, length);
		} else {
			targetElement.focus();
		}
	};


	/**
	 * Check whether the given target element is a child of a scrollable layer and if so, set a flag on it.
	 *
	 * @param {EventTarget|Element} targetElement
	 */
	FastClick.prototype.updateScrollParent = function(targetElement) {
		var scrollParent, parentElement;

		scrollParent = targetElement.fastClickScrollParent;

		// Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
		// target element was moved to another parent.
		if (!scrollParent || !scrollParent.contains(targetElement)) {
			parentElement = targetElement;
			do {
				if (parentElement.scrollHeight > parentElement.offsetHeight) {
					scrollParent = parentElement;
					targetElement.fastClickScrollParent = parentElement;
					break;
				}

				parentElement = parentElement.parentElement;
			} while (parentElement);
		}

		// Always update the scroll top tracker if possible.
		if (scrollParent) {
			scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
		}
	};


	/**
	 * @param {EventTarget} targetElement
	 * @returns {Element|EventTarget}
	 */
	FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {

		// On some older browsers (notably Safari on iOS 4.1 - see issue #56) the event target may be a text node.
		if (eventTarget.nodeType === Node.TEXT_NODE) {
			return eventTarget.parentNode;
		}

		return eventTarget;
	};


	/**
	 * On touch start, record the position and scroll offset.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchStart = function(event) {
		var targetElement, touch, selection;

		// Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
		if (event.targetTouches.length > 1) {
			return true;
		}

		targetElement = this.getTargetElementFromEventTarget(event.target);
		touch = event.targetTouches[0];

		if (deviceIsIOS) {

			// Only trusted events will deselect text on iOS (issue #49)
			selection = window.getSelection();
			if (selection.rangeCount && !selection.isCollapsed) {
				return true;
			}

			if (!deviceIsIOS4) {

				// Weird things happen on iOS when an alert or confirm dialog is opened from a click event callback (issue #23):
				// when the user next taps anywhere else on the page, new touchstart and touchend events are dispatched
				// with the same identifier as the touch event that previously triggered the click that triggered the alert.
				// Sadly, there is an issue on iOS 4 that causes some normal touch events to have the same identifier as an
				// immediately preceeding touch event (issue #52), so this fix is unavailable on that platform.
				// Issue 120: touch.identifier is 0 when Chrome dev tools 'Emulate touch events' is set with an iOS device UA string,
				// which causes all touch events to be ignored. As this block only applies to iOS, and iOS identifiers are always long,
				// random integers, it's safe to to continue if the identifier is 0 here.
				if (touch.identifier && touch.identifier === this.lastTouchIdentifier) {
					event.preventDefault();
					return false;
				}

				this.lastTouchIdentifier = touch.identifier;

				// If the target element is a child of a scrollable layer (using -webkit-overflow-scrolling: touch) and:
				// 1) the user does a fling scroll on the scrollable layer
				// 2) the user stops the fling scroll with another tap
				// then the event.target of the last 'touchend' event will be the element that was under the user's finger
				// when the fling scroll was started, causing FastClick to send a click event to that layer - unless a check
				// is made to ensure that a parent layer was not scrolled before sending a synthetic click (issue #42).
				this.updateScrollParent(targetElement);
			}
		}

		this.trackingClick = true;
		this.trackingClickStart = event.timeStamp;
		this.targetElement = targetElement;

		this.touchStartX = touch.pageX;
		this.touchStartY = touch.pageY;

		// Prevent phantom clicks on fast double-tap (issue #36)
		if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
			event.preventDefault();
		}

		return true;
	};


	/**
	 * Based on a touchmove event object, check whether the touch has moved past a boundary since it started.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.touchHasMoved = function(event) {
		var touch = event.changedTouches[0], boundary = this.touchBoundary;

		if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
			return true;
		}

		return false;
	};


	/**
	 * Update the last position.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchMove = function(event) {
		if (!this.trackingClick) {
			return true;
		}

		// If the touch has moved, cancel the click tracking
		if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
			this.trackingClick = false;
			this.targetElement = null;
		}

		return true;
	};


	/**
	 * Attempt to find the labelled control for the given label element.
	 *
	 * @param {EventTarget|HTMLLabelElement} labelElement
	 * @returns {Element|null}
	 */
	FastClick.prototype.findControl = function(labelElement) {

		// Fast path for newer browsers supporting the HTML5 control attribute
		if (labelElement.control !== undefined) {
			return labelElement.control;
		}

		// All browsers under test that support touch events also support the HTML5 htmlFor attribute
		if (labelElement.htmlFor) {
			return document.getElementById(labelElement.htmlFor);
		}

		// If no for attribute exists, attempt to retrieve the first labellable descendant element
		// the list of which is defined here: http://www.w3.org/TR/html5/forms.html#category-label
		return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
	};


	/**
	 * On touch end, determine whether to send a click event at once.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchEnd = function(event) {
		var forElement, trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

		if (!this.trackingClick) {
			return true;
		}

		// Prevent phantom clicks on fast double-tap (issue #36)
		if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
			this.cancelNextClick = true;
			return true;
		}

		if ((event.timeStamp - this.trackingClickStart) > this.tapTimeout) {
			return true;
		}

		// Reset to prevent wrong click cancel on input (issue #156).
		this.cancelNextClick = false;

		this.lastClickTime = event.timeStamp;

		trackingClickStart = this.trackingClickStart;
		this.trackingClick = false;
		this.trackingClickStart = 0;

		// On some iOS devices, the targetElement supplied with the event is invalid if the layer
		// is performing a transition or scroll, and has to be re-detected manually. Note that
		// for this to function correctly, it must be called *after* the event target is checked!
		// See issue #57; also filed as rdar://13048589 .
		if (deviceIsIOSWithBadTarget) {
			touch = event.changedTouches[0];

			// In certain cases arguments of elementFromPoint can be negative, so prevent setting targetElement to null
			targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
			targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
		}

		targetTagName = targetElement.tagName.toLowerCase();
		if (targetTagName === 'label') {
			forElement = this.findControl(targetElement);
			if (forElement) {
				this.focus(targetElement);
				if (deviceIsAndroid) {
					return false;
				}

				targetElement = forElement;
			}
		} else if (this.needsFocus(targetElement)) {

			// Case 1: If the touch started a while ago (best guess is 100ms based on tests for issue #36) then focus will be triggered anyway. Return early and unset the target element reference so that the subsequent click will be allowed through.
			// Case 2: Without this exception for input elements tapped when the document is contained in an iframe, then any inputted text won't be visible even though the value attribute is updated as the user types (issue #37).
			if ((event.timeStamp - trackingClickStart) > 100 || (deviceIsIOS && window.top !== window && targetTagName === 'input')) {
				this.targetElement = null;
				return false;
			}

			this.focus(targetElement);
			this.sendClick(targetElement, event);

			// Select elements need the event to go through on iOS 4, otherwise the selector menu won't open.
			// Also this breaks opening selects when VoiceOver is active on iOS6, iOS7 (and possibly others)
			if (!deviceIsIOS || targetTagName !== 'select') {
				this.targetElement = null;
				event.preventDefault();
			}

			return false;
		}

		if (deviceIsIOS && !deviceIsIOS4) {

			// Don't send a synthetic click event if the target element is contained within a parent layer that was scrolled
			// and this tap is being used to stop the scrolling (usually initiated by a fling - issue #42).
			scrollParent = targetElement.fastClickScrollParent;
			if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
				return true;
			}
		}

		// Prevent the actual click from going though - unless the target node is marked as requiring
		// real clicks or if it is in the whitelist in which case only non-programmatic clicks are permitted.
		if (!this.needsClick(targetElement)) {
			event.preventDefault();
			this.sendClick(targetElement, event);
		}

		return false;
	};


	/**
	 * On touch cancel, stop tracking the click.
	 *
	 * @returns {void}
	 */
	FastClick.prototype.onTouchCancel = function() {
		this.trackingClick = false;
		this.targetElement = null;
	};


	/**
	 * Determine mouse events which should be permitted.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onMouse = function(event) {

		// If a target element was never set (because a touch event was never fired) allow the event
		if (!this.targetElement) {
			return true;
		}

		if (event.forwardedTouchEvent) {
			return true;
		}

		// Programmatically generated events targeting a specific element should be permitted
		if (!event.cancelable) {
			return true;
		}

		// Derive and check the target element to see whether the mouse event needs to be permitted;
		// unless explicitly enabled, prevent non-touch click events from triggering actions,
		// to prevent ghost/doubleclicks.
		if (!this.needsClick(this.targetElement) || this.cancelNextClick) {

			// Prevent any user-added listeners declared on FastClick element from being fired.
			if (event.stopImmediatePropagation) {
				event.stopImmediatePropagation();
			} else {

				// Part of the hack for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
				event.propagationStopped = true;
			}

			// Cancel the event
			event.stopPropagation();
			event.preventDefault();

			return false;
		}

		// If the mouse event is permitted, return true for the action to go through.
		return true;
	};


	/**
	 * On actual clicks, determine whether this is a touch-generated click, a click action occurring
	 * naturally after a delay after a touch (which needs to be cancelled to avoid duplication), or
	 * an actual click which should be permitted.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onClick = function(event) {
		var permitted;

		// It's possible for another FastClick-like library delivered with third-party code to fire a click event before FastClick does (issue #44). In that case, set the click-tracking flag back to false and return early. This will cause onTouchEnd to return early.
		if (this.trackingClick) {
			this.targetElement = null;
			this.trackingClick = false;
			return true;
		}

		// Very odd behaviour on iOS (issue #18): if a submit element is present inside a form and the user hits enter in the iOS simulator or clicks the Go button on the pop-up OS keyboard the a kind of 'fake' click event will be triggered with the submit-type input element as the target.
		if (event.target.type === 'submit' && event.detail === 0) {
			return true;
		}

		permitted = this.onMouse(event);

		// Only unset targetElement if the click is not permitted. This will ensure that the check for !targetElement in onMouse fails and the browser's click doesn't go through.
		if (!permitted) {
			this.targetElement = null;
		}

		// If clicks are permitted, return true for the action to go through.
		return permitted;
	};


	/**
	 * Remove all FastClick's event listeners.
	 *
	 * @returns {void}
	 */
	FastClick.prototype.destroy = function() {
		var layer = this.layer;

		if (deviceIsAndroid) {
			layer.removeEventListener('mouseover', this.onMouse, true);
			layer.removeEventListener('mousedown', this.onMouse, true);
			layer.removeEventListener('mouseup', this.onMouse, true);
		}

		layer.removeEventListener('click', this.onClick, true);
		layer.removeEventListener('touchstart', this.onTouchStart, false);
		layer.removeEventListener('touchmove', this.onTouchMove, false);
		layer.removeEventListener('touchend', this.onTouchEnd, false);
		layer.removeEventListener('touchcancel', this.onTouchCancel, false);
	};


	/**
	 * Check whether FastClick is needed.
	 *
	 * @param {Element} layer The layer to listen on
	 */
	FastClick.notNeeded = function(layer) {
		var metaViewport;
		var chromeVersion;
		var blackberryVersion;
		var firefoxVersion;

		// Devices that don't support touch don't need FastClick
		if (typeof window.ontouchstart === 'undefined') {
			return true;
		}

		// Chrome version - zero for other browsers
		chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

		if (chromeVersion) {

			if (deviceIsAndroid) {
				metaViewport = document.querySelector('meta[name=viewport]');

				if (metaViewport) {
					// Chrome on Android with user-scalable="no" doesn't need FastClick (issue #89)
					if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
						return true;
					}
					// Chrome 32 and above with width=device-width or less don't need FastClick
					if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
						return true;
					}
				}

			// Chrome desktop doesn't need FastClick (issue #15)
			} else {
				return true;
			}
		}

		if (deviceIsBlackBerry10) {
			blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

			// BlackBerry 10.3+ does not require Fastclick library.
			// https://github.com/ftlabs/fastclick/issues/251
			if (blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3) {
				metaViewport = document.querySelector('meta[name=viewport]');

				if (metaViewport) {
					// user-scalable=no eliminates click delay.
					if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
						return true;
					}
					// width=device-width (or less than device-width) eliminates click delay.
					if (document.documentElement.scrollWidth <= window.outerWidth) {
						return true;
					}
				}
			}
		}

		// IE10 with -ms-touch-action: none or manipulation, which disables double-tap-to-zoom (issue #97)
		if (layer.style.msTouchAction === 'none' || layer.style.touchAction === 'manipulation') {
			return true;
		}

		// Firefox version - zero for other browsers
		firefoxVersion = +(/Firefox\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

		if (firefoxVersion >= 27) {
			// Firefox 27+ does not have tap delay if the content is not zoomable - https://bugzilla.mozilla.org/show_bug.cgi?id=922896

			metaViewport = document.querySelector('meta[name=viewport]');
			if (metaViewport && (metaViewport.content.indexOf('user-scalable=no') !== -1 || document.documentElement.scrollWidth <= window.outerWidth)) {
				return true;
			}
		}

		// IE11: prefixed -ms-touch-action is no longer supported and it's recomended to use non-prefixed version
		// http://msdn.microsoft.com/en-us/library/windows/apps/Hh767313.aspx
		if (layer.style.touchAction === 'none' || layer.style.touchAction === 'manipulation') {
			return true;
		}

		return false;
	};


	/**
	 * Factory method for creating a FastClick object
	 *
	 * @param {Element} layer The layer to listen on
	 * @param {Object} [options={}] The options to override the defaults
	 */
	FastClick.attach = function(layer, options) {
		return new FastClick(layer, options);
	};


	if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {

		// AMD. Register as an anonymous module.
		define(function() {
			return FastClick;
		});
	} else if (typeof module !== 'undefined' && module.exports) {
		module.exports = FastClick.attach;
		module.exports.FastClick = FastClick;
	} else {
		window.FastClick = FastClick;
	}
}());
//# sourceMappingURL=gmaps.min.js.map
"use strict";!function(a,b){"object"==typeof exports?module.exports=b():"function"==typeof define&&define.amd?define(["jquery","googlemaps!"],b):a.GMaps=b()}(this,function(){var a=function(a,b){var c;if(a===b)return a;for(c in b)void 0!==b[c]&&(a[c]=b[c]);return a},b=function(a,b){var c,d=Array.prototype.slice.call(arguments,2),e=[],f=a.length;if(Array.prototype.map&&a.map===Array.prototype.map)e=Array.prototype.map.call(a,function(a){var c=d.slice(0);return c.splice(0,0,a),b.apply(this,c)});else for(c=0;c<f;c++)callback_params=d,callback_params.splice(0,0,a[c]),e.push(b.apply(this,callback_params));return e},c=function(a){var b,c=[];for(b=0;b<a.length;b++)c=c.concat(a[b]);return c},d=function(a,b){var c=a[0],d=a[1];return b&&(c=a[1],d=a[0]),new google.maps.LatLng(c,d)},f=function(a,b){var c;for(c=0;c<a.length;c++)a[c]instanceof google.maps.LatLng||(a[c].length>0&&"object"==typeof a[c][0]?a[c]=f(a[c],b):a[c]=d(a[c],b));return a},g=function(a,b){var c=a.replace(".","");return"jQuery"in this&&b?$("."+c,b)[0]:document.getElementsByClassName(c)[0]},h=function(a,b){var a=a.replace("#","");return"jQuery"in window&&b?$("#"+a,b)[0]:document.getElementById(a)},i=function(a){var b=0,c=0;if(a.getBoundingClientRect){var d=a.getBoundingClientRect(),e=-(window.scrollX?window.scrollX:window.pageXOffset),f=-(window.scrollY?window.scrollY:window.pageYOffset);return[d.left-e,d.top-f]}if(a.offsetParent)do b+=a.offsetLeft,c+=a.offsetTop;while(a=a.offsetParent);return[b,c]},j=function(b){var c=document,d=function(b){if("object"!=typeof window.google||!window.google.maps)return"object"==typeof window.console&&window.console.error&&console.error("Google Maps API is required. Please register the following JavaScript library https://maps.googleapis.com/maps/api/js."),function(){};if(!this)return new d(b);b.zoom=b.zoom||15,b.mapType=b.mapType||"roadmap";var e,f=function(a,b){return void 0===a?b:a},j=this,k=["bounds_changed","center_changed","click","dblclick","drag","dragend","dragstart","idle","maptypeid_changed","projection_changed","resize","tilesloaded","zoom_changed"],l=["mousemove","mouseout","mouseover"],m=["el","lat","lng","mapType","width","height","markerClusterer","enableNewStyle"],n=b.el||b.div,o=b.markerClusterer,p=google.maps.MapTypeId[b.mapType.toUpperCase()],q=new google.maps.LatLng(b.lat,b.lng),r=f(b.zoomControl,!0),s=b.zoomControlOpt||{style:"DEFAULT",position:"TOP_LEFT"},t=s.style||"DEFAULT",u=s.position||"TOP_LEFT",v=f(b.panControl,!0),w=f(b.mapTypeControl,!0),x=f(b.scaleControl,!0),y=f(b.streetViewControl,!0),z=f(z,!0),A={},B={zoom:this.zoom,center:q,mapTypeId:p},C={panControl:v,zoomControl:r,zoomControlOptions:{style:google.maps.ZoomControlStyle[t],position:google.maps.ControlPosition[u]},mapTypeControl:w,scaleControl:x,streetViewControl:y,overviewMapControl:z};if("string"==typeof b.el||"string"==typeof b.div?n.indexOf("#")>-1?this.el=h(n,b.context):this.el=g.apply(this,[n,b.context]):this.el=n,void 0===this.el||null===this.el)throw"No element defined.";for(window.context_menu=window.context_menu||{},window.context_menu[j.el.id]={},this.controls=[],this.overlays=[],this.layers=[],this.singleLayers={},this.markers=[],this.polylines=[],this.routes=[],this.polygons=[],this.infoWindow=null,this.overlay_el=null,this.zoom=b.zoom,this.registered_events={},this.el.style.width=b.width||this.el.scrollWidth||this.el.offsetWidth,this.el.style.height=b.height||this.el.scrollHeight||this.el.offsetHeight,google.maps.visualRefresh=b.enableNewStyle,e=0;e<m.length;e++)delete b[m[e]];for(1!=b.disableDefaultUI&&(B=a(B,C)),A=a(B,b),e=0;e<k.length;e++)delete A[k[e]];for(e=0;e<l.length;e++)delete A[l[e]];this.map=new google.maps.Map(this.el,A),o&&(this.markerClusterer=o.apply(this,[this.map]));var D=function(a,b){var c="",d=window.context_menu[j.el.id][a];for(var e in d)if(d.hasOwnProperty(e)){var f=d[e];c+='<li><a id="'+a+"_"+e+'" href="#">'+f.title+"</a></li>"}if(h("gmaps_context_menu")){var g=h("gmaps_context_menu");g.innerHTML=c;var e,k=g.getElementsByTagName("a"),l=k.length;for(e=0;e<l;e++){var m=k[e],n=function(c){c.preventDefault(),d[this.id.replace(a+"_","")].action.apply(j,[b]),j.hideContextMenu()};google.maps.event.clearListeners(m,"click"),google.maps.event.addDomListenerOnce(m,"click",n,!1)}var o=i.apply(this,[j.el]),p=o[0]+b.pixel.x-15,q=o[1]+b.pixel.y-15;g.style.left=p+"px",g.style.top=q+"px"}};this.buildContextMenu=function(a,b){if("marker"===a){b.pixel={};var c=new google.maps.OverlayView;c.setMap(j.map),c.draw=function(){var d=c.getProjection(),e=b.marker.getPosition();b.pixel=d.fromLatLngToContainerPixel(e),D(a,b)}}else D(a,b);var d=h("gmaps_context_menu");setTimeout(function(){d.style.display="block"},0)},this.setContextMenu=function(a){window.context_menu[j.el.id][a.control]={};var b,d=c.createElement("ul");for(b in a.options)if(a.options.hasOwnProperty(b)){var e=a.options[b];window.context_menu[j.el.id][a.control][e.name]={title:e.title,action:e.action}}d.id="gmaps_context_menu",d.style.display="none",d.style.position="absolute",d.style.minWidth="100px",d.style.background="white",d.style.listStyle="none",d.style.padding="8px",d.style.boxShadow="2px 2px 6px #ccc",h("gmaps_context_menu")||c.body.appendChild(d);var f=h("gmaps_context_menu");google.maps.event.addDomListener(f,"mouseout",function(a){a.relatedTarget&&this.contains(a.relatedTarget)||window.setTimeout(function(){f.style.display="none"},400)},!1)},this.hideContextMenu=function(){var a=h("gmaps_context_menu");a&&(a.style.display="none")};var E=function(a,c){google.maps.event.addListener(a,c,function(a){void 0==a&&(a=this),b[c].apply(this,[a]),j.hideContextMenu()})};google.maps.event.addListener(this.map,"zoom_changed",this.hideContextMenu);for(var F=0;F<k.length;F++){var G=k[F];G in b&&E(this.map,G)}for(var F=0;F<l.length;F++){var G=l[F];G in b&&E(this.map,G)}google.maps.event.addListener(this.map,"rightclick",function(a){b.rightclick&&b.rightclick.apply(this,[a]),void 0!=window.context_menu[j.el.id].map&&j.buildContextMenu("map",a)}),this.refresh=function(){google.maps.event.trigger(this.map,"resize")},this.fitZoom=function(){var a,b=[],c=this.markers.length;for(a=0;a<c;a++)"boolean"==typeof this.markers[a].visible&&this.markers[a].visible&&b.push(this.markers[a].getPosition());this.fitLatLngBounds(b)},this.fitLatLngBounds=function(a){var b,c=a.length,d=new google.maps.LatLngBounds;for(b=0;b<c;b++)d.extend(a[b]);this.map.fitBounds(d)},this.setCenter=function(a,b,c){this.map.panTo(new google.maps.LatLng(a,b)),c&&c()},this.getElement=function(){return this.el},this.zoomIn=function(a){a=a||1,this.zoom=this.map.getZoom()+a,this.map.setZoom(this.zoom)},this.zoomOut=function(a){a=a||1,this.zoom=this.map.getZoom()-a,this.map.setZoom(this.zoom)};var H,I=[];for(H in this.map)"function"!=typeof this.map[H]||this[H]||I.push(H);for(e=0;e<I.length;e++)!function(a,b,c){a[c]=function(){return b[c].apply(b,arguments)}}(this,this.map,I[e])};return d}(this);j.prototype.createControl=function(a){var b=document.createElement("div");b.style.cursor="pointer",a.disableDefaultStyles!==!0&&(b.style.fontFamily="Roboto, Arial, sans-serif",b.style.fontSize="11px",b.style.boxShadow="rgba(0, 0, 0, 0.298039) 0px 1px 4px -1px");for(var c in a.style)b.style[c]=a.style[c];a.id&&(b.id=a.id),a.title&&(b.title=a.title),a.classes&&(b.className=a.classes),a.content&&("string"==typeof a.content?b.innerHTML=a.content:a.content instanceof HTMLElement&&b.appendChild(a.content)),a.position&&(b.position=google.maps.ControlPosition[a.position.toUpperCase()]);for(var d in a.events)!function(b,c){google.maps.event.addDomListener(b,c,function(){a.events[c].apply(this,[this])})}(b,d);return b.index=1,b},j.prototype.addControl=function(a){var b=this.createControl(a);return this.controls.push(b),this.map.controls[b.position].push(b),b},j.prototype.removeControl=function(a){var b,c=null;for(b=0;b<this.controls.length;b++)this.controls[b]==a&&(c=this.controls[b].position,this.controls.splice(b,1));if(c)for(b=0;b<this.map.controls.length;b++){var d=this.map.controls[a.position];if(d.getAt(b)==a){d.removeAt(b);break}}return a},j.prototype.createMarker=function(b){if(void 0==b.lat&&void 0==b.lng&&void 0==b.position)throw"No latitude or longitude defined.";var c=this,d=b.details,e=b.fences,f=b.outside,g={position:new google.maps.LatLng(b.lat,b.lng),map:null},h=a(g,b);delete h.lat,delete h.lng,delete h.fences,delete h.outside;var i=new google.maps.Marker(h);if(i.fences=e,b.infoWindow){i.infoWindow=new google.maps.InfoWindow(b.infoWindow);for(var j=["closeclick","content_changed","domready","position_changed","zindex_changed"],k=0;k<j.length;k++)!function(a,c){b.infoWindow[c]&&google.maps.event.addListener(a,c,function(a){b.infoWindow[c].apply(this,[a])})}(i.infoWindow,j[k])}for(var l=["animation_changed","clickable_changed","cursor_changed","draggable_changed","flat_changed","icon_changed","position_changed","shadow_changed","shape_changed","title_changed","visible_changed","zindex_changed"],m=["dblclick","drag","dragend","dragstart","mousedown","mouseout","mouseover","mouseup"],k=0;k<l.length;k++)!function(a,c){b[c]&&google.maps.event.addListener(a,c,function(){b[c].apply(this,[this])})}(i,l[k]);for(var k=0;k<m.length;k++)!function(a,c,d){b[d]&&google.maps.event.addListener(c,d,function(c){c.pixel||(c.pixel=a.getProjection().fromLatLngToPoint(c.latLng)),b[d].apply(this,[c])})}(this.map,i,m[k]);return google.maps.event.addListener(i,"click",function(){this.details=d,b.click&&b.click.apply(this,[this]),i.infoWindow&&(c.hideInfoWindows(),i.infoWindow.open(c.map,i))}),google.maps.event.addListener(i,"rightclick",function(a){a.marker=this,b.rightclick&&b.rightclick.apply(this,[a]),void 0!=window.context_menu[c.el.id].marker&&c.buildContextMenu("marker",a)}),i.fences&&google.maps.event.addListener(i,"dragend",function(){c.checkMarkerGeofence(i,function(a,b){f(a,b)})}),i},j.prototype.addMarker=function(a){var b;if(a.hasOwnProperty("gm_accessors_"))b=a;else{if(!(a.hasOwnProperty("lat")&&a.hasOwnProperty("lng")||a.position))throw"No latitude or longitude defined.";b=this.createMarker(a)}return b.setMap(this.map),this.markerClusterer&&this.markerClusterer.addMarker(b),this.markers.push(b),j.fire("marker_added",b,this),b},j.prototype.addMarkers=function(a){for(var b,c=0;b=a[c];c++)this.addMarker(b);return this.markers},j.prototype.hideInfoWindows=function(){for(var a,b=0;a=this.markers[b];b++)a.infoWindow&&a.infoWindow.close()},j.prototype.removeMarker=function(a){for(var b=0;b<this.markers.length;b++)if(this.markers[b]===a){this.markers[b].setMap(null),this.markers.splice(b,1),this.markerClusterer&&this.markerClusterer.removeMarker(a),j.fire("marker_removed",a,this);break}return a},j.prototype.removeMarkers=function(a){var b=[];if(void 0===a){for(var c=0;c<this.markers.length;c++){var d=this.markers[c];d.setMap(null),j.fire("marker_removed",d,this)}this.markerClusterer&&this.markerClusterer.clearMarkers&&this.markerClusterer.clearMarkers(),this.markers=b}else{for(var c=0;c<a.length;c++){var e=this.markers.indexOf(a[c]);if(e>-1){var d=this.markers[e];d.setMap(null),this.markerClusterer&&this.markerClusterer.removeMarker(d),j.fire("marker_removed",d,this)}}for(var c=0;c<this.markers.length;c++){var d=this.markers[c];null!=d.getMap()&&b.push(d)}this.markers=b}},j.prototype.drawOverlay=function(a){var b=new google.maps.OverlayView,c=!0;return b.setMap(this.map),null!=a.auto_show&&(c=a.auto_show),b.onAdd=function(){var c=document.createElement("div");c.style.borderStyle="none",c.style.borderWidth="0px",c.style.position="absolute",c.style.zIndex=100,c.innerHTML=a.content,b.el=c,a.layer||(a.layer="overlayLayer");var d=this.getPanes(),e=d[a.layer],f=["contextmenu","DOMMouseScroll","dblclick","mousedown"];e.appendChild(c);for(var g=0;g<f.length;g++)!function(a,b){google.maps.event.addDomListener(a,b,function(a){navigator.userAgent.toLowerCase().indexOf("msie")!=-1&&document.all?(a.cancelBubble=!0,a.returnValue=!1):a.stopPropagation()})}(c,f[g]);a.click&&(d.overlayMouseTarget.appendChild(b.el),google.maps.event.addDomListener(b.el,"click",function(){a.click.apply(b,[b])})),google.maps.event.trigger(this,"ready")},b.draw=function(){var d=this.getProjection(),e=d.fromLatLngToDivPixel(new google.maps.LatLng(a.lat,a.lng));a.horizontalOffset=a.horizontalOffset||0,a.verticalOffset=a.verticalOffset||0;var f=b.el,g=f.children[0],h=g.clientHeight,i=g.clientWidth;switch(a.verticalAlign){case"top":f.style.top=e.y-h+a.verticalOffset+"px";break;default:case"middle":f.style.top=e.y-h/2+a.verticalOffset+"px";break;case"bottom":f.style.top=e.y+a.verticalOffset+"px"}switch(a.horizontalAlign){case"left":f.style.left=e.x-i+a.horizontalOffset+"px";break;default:case"center":f.style.left=e.x-i/2+a.horizontalOffset+"px";break;case"right":f.style.left=e.x+a.horizontalOffset+"px"}f.style.display=c?"block":"none",c||a.show.apply(this,[f])},b.onRemove=function(){var c=b.el;a.remove?a.remove.apply(this,[c]):(b.el.parentNode.removeChild(b.el),b.el=null)},this.overlays.push(b),b},j.prototype.removeOverlay=function(a){for(var b=0;b<this.overlays.length;b++)if(this.overlays[b]===a){this.overlays[b].setMap(null),this.overlays.splice(b,1);break}},j.prototype.removeOverlays=function(){for(var a,b=0;a=this.overlays[b];b++)a.setMap(null);this.overlays=[]},j.prototype.drawPolyline=function(a){var b=[],c=a.path;if(c.length)if(void 0===c[0][0])b=c;else for(var d,e=0;d=c[e];e++)b.push(new google.maps.LatLng(d[0],d[1]));var f={map:this.map,path:b,strokeColor:a.strokeColor,strokeOpacity:a.strokeOpacity,strokeWeight:a.strokeWeight,geodesic:a.geodesic,clickable:!0,editable:!1,visible:!0};a.hasOwnProperty("clickable")&&(f.clickable=a.clickable),a.hasOwnProperty("editable")&&(f.editable=a.editable),a.hasOwnProperty("icons")&&(f.icons=a.icons),a.hasOwnProperty("zIndex")&&(f.zIndex=a.zIndex);for(var g=new google.maps.Polyline(f),h=["click","dblclick","mousedown","mousemove","mouseout","mouseover","mouseup","rightclick"],i=0;i<h.length;i++)!function(b,c){a[c]&&google.maps.event.addListener(b,c,function(b){a[c].apply(this,[b])})}(g,h[i]);return this.polylines.push(g),j.fire("polyline_added",g,this),g},j.prototype.removePolyline=function(a){for(var b=0;b<this.polylines.length;b++)if(this.polylines[b]===a){this.polylines[b].setMap(null),this.polylines.splice(b,1),j.fire("polyline_removed",a,this);break}},j.prototype.removePolylines=function(){for(var a,b=0;a=this.polylines[b];b++)a.setMap(null);this.polylines=[]},j.prototype.drawCircle=function(b){b=a({map:this.map,center:new google.maps.LatLng(b.lat,b.lng)},b),delete b.lat,delete b.lng;for(var c=new google.maps.Circle(b),d=["click","dblclick","mousedown","mousemove","mouseout","mouseover","mouseup","rightclick"],e=0;e<d.length;e++)!function(a,c){b[c]&&google.maps.event.addListener(a,c,function(a){b[c].apply(this,[a])})}(c,d[e]);return this.polygons.push(c),c},j.prototype.drawRectangle=function(b){b=a({map:this.map},b);var c=new google.maps.LatLngBounds(new google.maps.LatLng(b.bounds[0][0],b.bounds[0][1]),new google.maps.LatLng(b.bounds[1][0],b.bounds[1][1]));b.bounds=c;for(var d=new google.maps.Rectangle(b),e=["click","dblclick","mousedown","mousemove","mouseout","mouseover","mouseup","rightclick"],f=0;f<e.length;f++)!function(a,c){b[c]&&google.maps.event.addListener(a,c,function(a){b[c].apply(this,[a])})}(d,e[f]);return this.polygons.push(d),d},j.prototype.drawPolygon=function(d){var e=!1;d.hasOwnProperty("useGeoJSON")&&(e=d.useGeoJSON),delete d.useGeoJSON,d=a({map:this.map},d),0==e&&(d.paths=[d.paths.slice(0)]),d.paths.length>0&&d.paths[0].length>0&&(d.paths=c(b(d.paths,f,e)));for(var g=new google.maps.Polygon(d),h=["click","dblclick","mousedown","mousemove","mouseout","mouseover","mouseup","rightclick"],i=0;i<h.length;i++)!function(a,b){d[b]&&google.maps.event.addListener(a,b,function(a){d[b].apply(this,[a])})}(g,h[i]);return this.polygons.push(g),j.fire("polygon_added",g,this),g},j.prototype.removePolygon=function(a){for(var b=0;b<this.polygons.length;b++)if(this.polygons[b]===a){this.polygons[b].setMap(null),this.polygons.splice(b,1),j.fire("polygon_removed",a,this);break}},j.prototype.removePolygons=function(){for(var a,b=0;a=this.polygons[b];b++)a.setMap(null);this.polygons=[]},j.prototype.getFromFusionTables=function(a){var b=a.events;delete a.events;var c=a,d=new google.maps.FusionTablesLayer(c);for(var e in b)!function(a,c){google.maps.event.addListener(a,c,function(a){b[c].apply(this,[a])})}(d,e);return this.layers.push(d),d},j.prototype.loadFromFusionTables=function(a){var b=this.getFromFusionTables(a);return b.setMap(this.map),b},j.prototype.getFromKML=function(a){var b=a.url,c=a.events;delete a.url,delete a.events;var d=a,e=new google.maps.KmlLayer(b,d);for(var f in c)!function(a,b){google.maps.event.addListener(a,b,function(a){c[b].apply(this,[a])})}(e,f);return this.layers.push(e),e},j.prototype.loadFromKML=function(a){var b=this.getFromKML(a);return b.setMap(this.map),b},j.prototype.addLayer=function(a,b){b=b||{};var c;switch(a){case"weather":this.singleLayers.weather=c=new google.maps.weather.WeatherLayer;break;case"clouds":this.singleLayers.clouds=c=new google.maps.weather.CloudLayer;break;case"traffic":this.singleLayers.traffic=c=new google.maps.TrafficLayer;break;case"transit":this.singleLayers.transit=c=new google.maps.TransitLayer;break;case"bicycling":this.singleLayers.bicycling=c=new google.maps.BicyclingLayer;break;case"panoramio":this.singleLayers.panoramio=c=new google.maps.panoramio.PanoramioLayer,c.setTag(b.filter),delete b.filter,b.click&&google.maps.event.addListener(c,"click",function(a){b.click(a),delete b.click});break;case"places":if(this.singleLayers.places=c=new google.maps.places.PlacesService(this.map),b.search||b.nearbySearch||b.radarSearch){var d={bounds:b.bounds||null,keyword:b.keyword||null,location:b.location||null,name:b.name||null,radius:b.radius||null,rankBy:b.rankBy||null,types:b.types||null};b.radarSearch&&c.radarSearch(d,b.radarSearch),b.search&&c.search(d,b.search),b.nearbySearch&&c.nearbySearch(d,b.nearbySearch)}if(b.textSearch){var e={bounds:b.bounds||null,location:b.location||null,query:b.query||null,radius:b.radius||null};c.textSearch(e,b.textSearch)}}if(void 0!==c)return"function"==typeof c.setOptions&&c.setOptions(b),"function"==typeof c.setMap&&c.setMap(this.map),c},j.prototype.removeLayer=function(a){if("string"==typeof a&&void 0!==this.singleLayers[a])this.singleLayers[a].setMap(null),delete this.singleLayers[a];else for(var b=0;b<this.layers.length;b++)if(this.layers[b]===a){this.layers[b].setMap(null),this.layers.splice(b,1);break}};var k,l;return j.prototype.getRoutes=function(b){switch(b.travelMode){case"bicycling":k=google.maps.TravelMode.BICYCLING;break;case"transit":k=google.maps.TravelMode.TRANSIT;break;case"driving":k=google.maps.TravelMode.DRIVING;break;default:k=google.maps.TravelMode.WALKING}l="imperial"===b.unitSystem?google.maps.UnitSystem.IMPERIAL:google.maps.UnitSystem.METRIC;var c={avoidHighways:!1,avoidTolls:!1,optimizeWaypoints:!1,waypoints:[]},d=a(c,b);d.origin=/string/.test(typeof b.origin)?b.origin:new google.maps.LatLng(b.origin[0],b.origin[1]),d.destination=/string/.test(typeof b.destination)?b.destination:new google.maps.LatLng(b.destination[0],b.destination[1]),d.travelMode=k,d.unitSystem=l,delete d.callback,delete d.error;var e=[];(new google.maps.DirectionsService).route(d,function(a,c){if(c===google.maps.DirectionsStatus.OK){for(var d in a.routes)a.routes.hasOwnProperty(d)&&e.push(a.routes[d]);b.callback&&b.callback(e,a,c)}else b.error&&b.error(a,c)})},j.prototype.removeRoutes=function(){this.routes.length=0},j.prototype.getElevations=function(d){d=a({locations:[],path:!1,samples:256},d),d.locations.length>0&&d.locations[0].length>0&&(d.locations=c(b([d.locations],f,!1)));var e=d.callback;delete d.callback;var g=new google.maps.ElevationService;if(d.path){var h={path:d.locations,samples:d.samples};g.getElevationAlongPath(h,function(a,b){e&&"function"==typeof e&&e(a,b)})}else delete d.path,delete d.samples,g.getElevationForLocations(d,function(a,b){e&&"function"==typeof e&&e(a,b)})},j.prototype.cleanRoute=j.prototype.removePolylines,j.prototype.renderRoute=function(b,c){var d,e="string"==typeof c.panel?document.getElementById(c.panel.replace("#","")):c.panel;c.panel=e,c=a({map:this.map},c),d=new google.maps.DirectionsRenderer(c),this.getRoutes({origin:b.origin,destination:b.destination,travelMode:b.travelMode,waypoints:b.waypoints,unitSystem:b.unitSystem,error:b.error,avoidHighways:b.avoidHighways,avoidTolls:b.avoidTolls,optimizeWaypoints:b.optimizeWaypoints,callback:function(a,b,c){c===google.maps.DirectionsStatus.OK&&d.setDirections(b)}})},j.prototype.drawRoute=function(a){var b=this;this.getRoutes({origin:a.origin,destination:a.destination,travelMode:a.travelMode,waypoints:a.waypoints,unitSystem:a.unitSystem,error:a.error,avoidHighways:a.avoidHighways,avoidTolls:a.avoidTolls,optimizeWaypoints:a.optimizeWaypoints,callback:function(c){if(c.length>0){var d={path:c[c.length-1].overview_path,strokeColor:a.strokeColor,strokeOpacity:a.strokeOpacity,strokeWeight:a.strokeWeight};a.hasOwnProperty("icons")&&(d.icons=a.icons),b.drawPolyline(d),a.callback&&a.callback(c[c.length-1])}}})},j.prototype.travelRoute=function(a){if(a.origin&&a.destination)this.getRoutes({origin:a.origin,destination:a.destination,travelMode:a.travelMode,waypoints:a.waypoints,unitSystem:a.unitSystem,error:a.error,callback:function(b){if(b.length>0&&a.start&&a.start(b[b.length-1]),b.length>0&&a.step){var c=b[b.length-1];if(c.legs.length>0)for(var d,e=c.legs[0].steps,f=0;d=e[f];f++)d.step_number=f,a.step(d,c.legs[0].steps.length-1)}b.length>0&&a.end&&a.end(b[b.length-1])}});else if(a.route&&a.route.legs.length>0)for(var b,c=a.route.legs[0].steps,d=0;b=c[d];d++)b.step_number=d,a.step(b)},j.prototype.drawSteppedRoute=function(a){var b=this;if(a.origin&&a.destination)this.getRoutes({origin:a.origin,destination:a.destination,travelMode:a.travelMode,waypoints:a.waypoints,error:a.error,callback:function(c){if(c.length>0&&a.start&&a.start(c[c.length-1]),c.length>0&&a.step){var d=c[c.length-1];if(d.legs.length>0)for(var e,f=d.legs[0].steps,g=0;e=f[g];g++){e.step_number=g;var h={path:e.path,strokeColor:a.strokeColor,strokeOpacity:a.strokeOpacity,strokeWeight:a.strokeWeight};a.hasOwnProperty("icons")&&(h.icons=a.icons),b.drawPolyline(h),a.step(e,d.legs[0].steps.length-1)}}c.length>0&&a.end&&a.end(c[c.length-1])}});else if(a.route&&a.route.legs.length>0)for(var c,d=a.route.legs[0].steps,e=0;c=d[e];e++){c.step_number=e;var f={path:c.path,strokeColor:a.strokeColor,strokeOpacity:a.strokeOpacity,strokeWeight:a.strokeWeight};a.hasOwnProperty("icons")&&(f.icons=a.icons),b.drawPolyline(f),a.step(c)}},j.Route=function(a){this.origin=a.origin,this.destination=a.destination,this.waypoints=a.waypoints,this.map=a.map,this.route=a.route,this.step_count=0,this.steps=this.route.legs[0].steps,this.steps_length=this.steps.length;var b={path:new google.maps.MVCArray,strokeColor:a.strokeColor,strokeOpacity:a.strokeOpacity,strokeWeight:a.strokeWeight};a.hasOwnProperty("icons")&&(b.icons=a.icons),this.polyline=this.map.drawPolyline(b).getPath()},j.Route.prototype.getRoute=function(a){var b=this;this.map.getRoutes({origin:this.origin,destination:this.destination,travelMode:a.travelMode,waypoints:this.waypoints||[],error:a.error,callback:function(){b.route=e[0],a.callback&&a.callback.call(b)}})},j.Route.prototype.back=function(){if(this.step_count>0){this.step_count--;var a=this.route.legs[0].steps[this.step_count].path;for(var b in a)a.hasOwnProperty(b)&&this.polyline.pop()}},j.Route.prototype.forward=function(){if(this.step_count<this.steps_length){var a=this.route.legs[0].steps[this.step_count].path;for(var b in a)a.hasOwnProperty(b)&&this.polyline.push(a[b]);this.step_count++}},j.prototype.checkGeofence=function(a,b,c){return c.containsLatLng(new google.maps.LatLng(a,b))},j.prototype.checkMarkerGeofence=function(a,b){if(a.fences)for(var c,d=0;c=a.fences[d];d++){var e=a.getPosition();this.checkGeofence(e.lat(),e.lng(),c)||b(a,c)}},j.prototype.toImage=function(a){var a=a||{},b={};if(b.size=a.size||[this.el.clientWidth,this.el.clientHeight],b.lat=this.getCenter().lat(),b.lng=this.getCenter().lng(),this.markers.length>0){b.markers=[];for(var c=0;c<this.markers.length;c++)b.markers.push({lat:this.markers[c].getPosition().lat(),lng:this.markers[c].getPosition().lng()})}if(this.polylines.length>0){var d=this.polylines[0];b.polyline={},b.polyline.path=google.maps.geometry.encoding.encodePath(d.getPath()),b.polyline.strokeColor=d.strokeColor,b.polyline.strokeOpacity=d.strokeOpacity,b.polyline.strokeWeight=d.strokeWeight}return j.staticMapURL(b)},j.staticMapURL=function(a){function b(a,b){if("#"===a[0]&&(a=a.replace("#","0x"),b)){if(b=parseFloat(b),0===(b=Math.min(1,Math.max(b,0))))return"0x00000000";b=(255*b).toString(16),1===b.length&&(b+=b),a=a.slice(0,8)+b}return a}var c,d=[],e=("file:"===location.protocol?"http:":location.protocol)+"//maps.googleapis.com/maps/api/staticmap";a.url&&(e=a.url,delete a.url),e+="?";var f=a.markers;delete a.markers,!f&&a.marker&&(f=[a.marker],delete a.marker);var g=a.styles;delete a.styles;var h=a.polyline;if(delete a.polyline,a.center)d.push("center="+a.center),delete a.center;else if(a.address)d.push("center="+a.address),delete a.address;else if(a.lat)d.push(["center=",a.lat,",",a.lng].join("")),delete a.lat,delete a.lng;else if(a.visible){var i=encodeURI(a.visible.join("|"));d.push("visible="+i)}var j=a.size;j?(j.join&&(j=j.join("x")),delete a.size):j="630x300",d.push("size="+j),a.zoom||a.zoom===!1||(a.zoom=15);var k=!a.hasOwnProperty("sensor")||!!a.sensor;delete a.sensor,d.push("sensor="+k);for(var l in a)a.hasOwnProperty(l)&&d.push(l+"="+a[l]);if(f)for(var m,n,o=0;c=f[o];o++){m=[],c.size&&"normal"!==c.size?(m.push("size:"+c.size),delete c.size):c.icon&&(m.push("icon:"+encodeURI(c.icon)),delete c.icon),c.color&&(m.push("color:"+c.color.replace("#","0x")),delete c.color),c.label&&(m.push("label:"+c.label[0].toUpperCase()),delete c.label),n=c.address?c.address:c.lat+","+c.lng,delete c.address,delete c.lat,delete c.lng;for(var l in c)c.hasOwnProperty(l)&&m.push(l+":"+c[l]);m.length||0===o?(m.push(n),m=m.join("|"),d.push("markers="+encodeURI(m))):(m=d.pop()+encodeURI("|"+n),d.push(m))}if(g)for(var o=0;o<g.length;o++){var p=[];g[o].featureType&&p.push("feature:"+g[o].featureType.toLowerCase()),g[o].elementType&&p.push("element:"+g[o].elementType.toLowerCase());for(var q=0;q<g[o].stylers.length;q++)for(var r in g[o].stylers[q]){var s=g[o].stylers[q][r];"hue"!=r&&"color"!=r||(s="0x"+s.substring(1)),p.push(r+":"+s)}var t=p.join("|");""!=t&&d.push("style="+t)}if(h){if(c=h,h=[],c.strokeWeight&&h.push("weight:"+parseInt(c.strokeWeight,10)),c.strokeColor){var u=b(c.strokeColor,c.strokeOpacity);h.push("color:"+u)}if(c.fillColor){var v=b(c.fillColor,c.fillOpacity);h.push("fillcolor:"+v)}var w=c.path;if(w.join)for(var x,q=0;x=w[q];q++)h.push(x.join(","));else h.push("enc:"+w);h=h.join("|"),d.push("path="+encodeURI(h))}var y=window.devicePixelRatio||1;return d.push("scale="+y),d=d.join("&"),e+d},j.prototype.addMapType=function(a,b){if(!b.hasOwnProperty("getTileUrl")||"function"!=typeof b.getTileUrl)throw"'getTileUrl' function required.";b.tileSize=b.tileSize||new google.maps.Size(256,256);var c=new google.maps.ImageMapType(b);this.map.mapTypes.set(a,c)},j.prototype.addOverlayMapType=function(a){if(!a.hasOwnProperty("getTile")||"function"!=typeof a.getTile)throw"'getTile' function required.";var b=a.index;delete a.index,this.map.overlayMapTypes.insertAt(b,a)},j.prototype.removeOverlayMapType=function(a){this.map.overlayMapTypes.removeAt(a)},j.prototype.addStyle=function(a){var b=new google.maps.StyledMapType(a.styles,{name:a.styledMapName});this.map.mapTypes.set(a.mapTypeId,b)},j.prototype.setStyle=function(a){this.map.setMapTypeId(a)},j.prototype.createPanorama=function(a){return a.hasOwnProperty("lat")&&a.hasOwnProperty("lng")||(a.lat=this.getCenter().lat(),a.lng=this.getCenter().lng()),this.panorama=j.createPanorama(a),this.map.setStreetView(this.panorama),this.panorama},j.createPanorama=function(b){var c=h(b.el,b.context);b.position=new google.maps.LatLng(b.lat,b.lng),delete b.el,delete b.context,delete b.lat,delete b.lng;for(var d=["closeclick","links_changed","pano_changed","position_changed","pov_changed","resize","visible_changed"],e=a({visible:!0},b),f=0;f<d.length;f++)delete e[d[f]];for(var g=new google.maps.StreetViewPanorama(c,e),f=0;f<d.length;f++)!function(a,c){b[c]&&google.maps.event.addListener(a,c,function(){b[c].apply(this)})}(g,d[f]);return g},j.prototype.on=function(a,b){return j.on(a,this,b)},j.prototype.off=function(a){j.off(a,this)},j.prototype.once=function(a,b){return j.once(a,this,b)},j.custom_events=["marker_added","marker_removed","polyline_added","polyline_removed","polygon_added","polygon_removed","geolocated","geolocation_failed"],j.on=function(a,b,c){if(j.custom_events.indexOf(a)==-1)return b instanceof j&&(b=b.map),google.maps.event.addListener(b,a,c);var d={handler:c,eventName:a};return b.registered_events[a]=b.registered_events[a]||[],b.registered_events[a].push(d),d},j.off=function(a,b){j.custom_events.indexOf(a)==-1?(b instanceof j&&(b=b.map),google.maps.event.clearListeners(b,a)):b.registered_events[a]=[]},j.once=function(a,b,c){if(j.custom_events.indexOf(a)==-1)return b instanceof j&&(b=b.map),google.maps.event.addListenerOnce(b,a,c)},j.fire=function(a,b,c){if(j.custom_events.indexOf(a)==-1)google.maps.event.trigger(b,a,Array.prototype.slice.apply(arguments).slice(2));else if(a in c.registered_events)for(var d=c.registered_events[a],e=0;e<d.length;e++)!function(a,b,c){a.apply(b,[c])}(d[e].handler,c,b)},j.geolocate=function(a){var b=a.always||a.complete;navigator.geolocation?navigator.geolocation.getCurrentPosition(function(c){a.success(c),b&&b()},function(c){a.error(c),b&&b()},a.options):(a.not_supported(),b&&b())},j.geocode=function(a){this.geocoder=new google.maps.Geocoder;var b=a.callback;a.hasOwnProperty("lat")&&a.hasOwnProperty("lng")&&(a.latLng=new google.maps.LatLng(a.lat,a.lng)),delete a.lat,delete a.lng,delete a.callback,this.geocoder.geocode(a,function(a,c){b(a,c)})},"object"==typeof window.google&&window.google.maps&&(google.maps.Polygon.prototype.getBounds||(google.maps.Polygon.prototype.getBounds=function(a){for(var b,c=new google.maps.LatLngBounds,d=this.getPaths(),e=0;e<d.getLength();e++){b=d.getAt(e);for(var f=0;f<b.getLength();f++)c.extend(b.getAt(f))}return c}),google.maps.Polygon.prototype.containsLatLng||(google.maps.Polygon.prototype.containsLatLng=function(a){var b=this.getBounds();if(null!==b&&!b.contains(a))return!1;for(var c=!1,d=this.getPaths().getLength(),e=0;e<d;e++)for(var f=this.getPaths().getAt(e),g=f.getLength(),h=g-1,i=0;i<g;i++){var j=f.getAt(i),k=f.getAt(h);(j.lng()<a.lng()&&k.lng()>=a.lng()||k.lng()<a.lng()&&j.lng()>=a.lng())&&j.lat()+(a.lng()-j.lng())/(k.lng()-j.lng())*(k.lat()-j.lat())<a.lat()&&(c=!c),h=i}return c}),google.maps.Circle.prototype.containsLatLng||(google.maps.Circle.prototype.containsLatLng=function(a){return!google.maps.geometry||google.maps.geometry.spherical.computeDistanceBetween(this.getCenter(),a)<=this.getRadius()}),google.maps.Rectangle.prototype.containsLatLng=function(a){return this.getBounds().contains(a)},google.maps.LatLngBounds.prototype.containsLatLng=function(a){return this.contains(a)},google.maps.Marker.prototype.setFences=function(a){this.fences=a},google.maps.Marker.prototype.addFence=function(a){this.fences.push(a)},google.maps.Marker.prototype.getId=function(){return this.__gm_id}),Array.prototype.indexOf||(Array.prototype.indexOf=function(a){if(null==this)throw new TypeError;var b=Object(this),c=b.length>>>0;if(0===c)return-1;var d=0;if(arguments.length>1&&(d=Number(arguments[1]),d!=d?d=0:0!=d&&d!=1/0&&d!=-(1/0)&&(d=(d>0||-1)*Math.floor(Math.abs(d)))),d>=c)return-1;for(var e=d>=0?d:Math.max(c-Math.abs(d),0);e<c;e++)if(e in b&&b[e]===a)return e;return-1}),j});

/*!
 * enquire.js v2.1.6 - Awesome Media Queries in JavaScript
 * Copyright (c) 2017 Nick Williams - http://wicky.nillia.ms/enquire.js
 * License: MIT */

!function(a){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=a();else if("function"==typeof define&&define.amd)define([],a);else{var b;b="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof self?self:this,b.enquire=a()}}(function(){return function a(b,c,d){function e(g,h){if(!c[g]){if(!b[g]){var i="function"==typeof require&&require;if(!h&&i)return i(g,!0);if(f)return f(g,!0);var j=new Error("Cannot find module '"+g+"'");throw j.code="MODULE_NOT_FOUND",j}var k=c[g]={exports:{}};b[g][0].call(k.exports,function(a){var c=b[g][1][a];return e(c?c:a)},k,k.exports,a,b,c,d)}return c[g].exports}for(var f="function"==typeof require&&require,g=0;g<d.length;g++)e(d[g]);return e}({1:[function(a,b,c){function d(a,b){this.query=a,this.isUnconditional=b,this.handlers=[],this.mql=window.matchMedia(a);var c=this;this.listener=function(a){c.mql=a.currentTarget||a,c.assess()},this.mql.addListener(this.listener)}var e=a(3),f=a(4).each;d.prototype={constuctor:d,addHandler:function(a){var b=new e(a);this.handlers.push(b),this.matches()&&b.on()},removeHandler:function(a){var b=this.handlers;f(b,function(c,d){if(c.equals(a))return c.destroy(),!b.splice(d,1)})},matches:function(){return this.mql.matches||this.isUnconditional},clear:function(){f(this.handlers,function(a){a.destroy()}),this.mql.removeListener(this.listener),this.handlers.length=0},assess:function(){var a=this.matches()?"on":"off";f(this.handlers,function(b){b[a]()})}},b.exports=d},{3:3,4:4}],2:[function(a,b,c){function d(){if(!window.matchMedia)throw new Error("matchMedia not present, legacy browsers require a polyfill");this.queries={},this.browserIsIncapable=!window.matchMedia("only all").matches}var e=a(1),f=a(4),g=f.each,h=f.isFunction,i=f.isArray;d.prototype={constructor:d,register:function(a,b,c){var d=this.queries,f=c&&this.browserIsIncapable;return d[a]||(d[a]=new e(a,f)),h(b)&&(b={match:b}),i(b)||(b=[b]),g(b,function(b){h(b)&&(b={match:b}),d[a].addHandler(b)}),this},unregister:function(a,b){var c=this.queries[a];return c&&(b?c.removeHandler(b):(c.clear(),delete this.queries[a])),this}},b.exports=d},{1:1,4:4}],3:[function(a,b,c){function d(a){this.options=a,!a.deferSetup&&this.setup()}d.prototype={constructor:d,setup:function(){this.options.setup&&this.options.setup(),this.initialised=!0},on:function(){!this.initialised&&this.setup(),this.options.match&&this.options.match()},off:function(){this.options.unmatch&&this.options.unmatch()},destroy:function(){this.options.destroy?this.options.destroy():this.off()},equals:function(a){return this.options===a||this.options.match===a}},b.exports=d},{}],4:[function(a,b,c){function d(a,b){var c=0,d=a.length;for(c;c<d&&b(a[c],c)!==!1;c++);}function e(a){return"[object Array]"===Object.prototype.toString.apply(a)}function f(a){return"function"==typeof a}b.exports={isFunction:f,isArray:e,each:d}},{}],5:[function(a,b,c){var d=a(2);b.exports=new d},{2:2}]},{},[5])(5)});

/*!
 * Flickity PACKAGED v2.1.2
 * Touch, responsive, flickable carousels
 *
 * Licensed GPLv3 for open source use
 * or Flickity Commercial License for commercial use
 *
 * https://flickity.metafizzy.co
 * Copyright 2015-2018 Metafizzy
 */

!function(t,e){"function"==typeof define&&define.amd?define("jquery-bridget/jquery-bridget",["jquery"],function(i){return e(t,i)}):"object"==typeof module&&module.exports?module.exports=e(t,require("jquery")):t.jQueryBridget=e(t,t.jQuery)}(window,function(t,e){"use strict";function i(i,o,a){function l(t,e,n){var s,o="$()."+i+'("'+e+'")';return t.each(function(t,l){var h=a.data(l,i);if(!h)return void r(i+" not initialized. Cannot call methods, i.e. "+o);var c=h[e];if(!c||"_"==e.charAt(0))return void r(o+" is not a valid method");var d=c.apply(h,n);s=void 0===s?d:s}),void 0!==s?s:t}function h(t,e){t.each(function(t,n){var s=a.data(n,i);s?(s.option(e),s._init()):(s=new o(n,e),a.data(n,i,s))})}a=a||e||t.jQuery,a&&(o.prototype.option||(o.prototype.option=function(t){a.isPlainObject(t)&&(this.options=a.extend(!0,this.options,t))}),a.fn[i]=function(t){if("string"==typeof t){var e=s.call(arguments,1);return l(this,t,e)}return h(this,t),this},n(a))}function n(t){!t||t&&t.bridget||(t.bridget=i)}var s=Array.prototype.slice,o=t.console,r="undefined"==typeof o?function(){}:function(t){o.error(t)};return n(e||t.jQuery),i}),function(t,e){"function"==typeof define&&define.amd?define("ev-emitter/ev-emitter",e):"object"==typeof module&&module.exports?module.exports=e():t.EvEmitter=e()}("undefined"!=typeof window?window:this,function(){function t(){}var e=t.prototype;return e.on=function(t,e){if(t&&e){var i=this._events=this._events||{},n=i[t]=i[t]||[];return n.indexOf(e)==-1&&n.push(e),this}},e.once=function(t,e){if(t&&e){this.on(t,e);var i=this._onceEvents=this._onceEvents||{},n=i[t]=i[t]||{};return n[e]=!0,this}},e.off=function(t,e){var i=this._events&&this._events[t];if(i&&i.length){var n=i.indexOf(e);return n!=-1&&i.splice(n,1),this}},e.emitEvent=function(t,e){var i=this._events&&this._events[t];if(i&&i.length){i=i.slice(0),e=e||[];for(var n=this._onceEvents&&this._onceEvents[t],s=0;s<i.length;s++){var o=i[s],r=n&&n[o];r&&(this.off(t,o),delete n[o]),o.apply(this,e)}return this}},e.allOff=function(){delete this._events,delete this._onceEvents},t}),function(t,e){"function"==typeof define&&define.amd?define("get-size/get-size",e):"object"==typeof module&&module.exports?module.exports=e():t.getSize=e()}(window,function(){"use strict";function t(t){var e=parseFloat(t),i=t.indexOf("%")==-1&&!isNaN(e);return i&&e}function e(){}function i(){for(var t={width:0,height:0,innerWidth:0,innerHeight:0,outerWidth:0,outerHeight:0},e=0;e<h;e++){var i=l[e];t[i]=0}return t}function n(t){var e=getComputedStyle(t);return e||a("Style returned "+e+". Are you running this code in a hidden iframe on Firefox? See https://bit.ly/getsizebug1"),e}function s(){if(!c){c=!0;var e=document.createElement("div");e.style.width="200px",e.style.padding="1px 2px 3px 4px",e.style.borderStyle="solid",e.style.borderWidth="1px 2px 3px 4px",e.style.boxSizing="border-box";var i=document.body||document.documentElement;i.appendChild(e);var s=n(e);r=200==Math.round(t(s.width)),o.isBoxSizeOuter=r,i.removeChild(e)}}function o(e){if(s(),"string"==typeof e&&(e=document.querySelector(e)),e&&"object"==typeof e&&e.nodeType){var o=n(e);if("none"==o.display)return i();var a={};a.width=e.offsetWidth,a.height=e.offsetHeight;for(var c=a.isBorderBox="border-box"==o.boxSizing,d=0;d<h;d++){var u=l[d],f=o[u],p=parseFloat(f);a[u]=isNaN(p)?0:p}var g=a.paddingLeft+a.paddingRight,v=a.paddingTop+a.paddingBottom,m=a.marginLeft+a.marginRight,y=a.marginTop+a.marginBottom,b=a.borderLeftWidth+a.borderRightWidth,E=a.borderTopWidth+a.borderBottomWidth,S=c&&r,C=t(o.width);C!==!1&&(a.width=C+(S?0:g+b));var x=t(o.height);return x!==!1&&(a.height=x+(S?0:v+E)),a.innerWidth=a.width-(g+b),a.innerHeight=a.height-(v+E),a.outerWidth=a.width+m,a.outerHeight=a.height+y,a}}var r,a="undefined"==typeof console?e:function(t){console.error(t)},l=["paddingLeft","paddingRight","paddingTop","paddingBottom","marginLeft","marginRight","marginTop","marginBottom","borderLeftWidth","borderRightWidth","borderTopWidth","borderBottomWidth"],h=l.length,c=!1;return o}),function(t,e){"use strict";"function"==typeof define&&define.amd?define("desandro-matches-selector/matches-selector",e):"object"==typeof module&&module.exports?module.exports=e():t.matchesSelector=e()}(window,function(){"use strict";var t=function(){var t=window.Element.prototype;if(t.matches)return"matches";if(t.matchesSelector)return"matchesSelector";for(var e=["webkit","moz","ms","o"],i=0;i<e.length;i++){var n=e[i],s=n+"MatchesSelector";if(t[s])return s}}();return function(e,i){return e[t](i)}}),function(t,e){"function"==typeof define&&define.amd?define("fizzy-ui-utils/utils",["desandro-matches-selector/matches-selector"],function(i){return e(t,i)}):"object"==typeof module&&module.exports?module.exports=e(t,require("desandro-matches-selector")):t.fizzyUIUtils=e(t,t.matchesSelector)}(window,function(t,e){var i={};i.extend=function(t,e){for(var i in e)t[i]=e[i];return t},i.modulo=function(t,e){return(t%e+e)%e};var n=Array.prototype.slice;i.makeArray=function(t){if(Array.isArray(t))return t;if(null===t||void 0===t)return[];var e="object"==typeof t&&"number"==typeof t.length;return e?n.call(t):[t]},i.removeFrom=function(t,e){var i=t.indexOf(e);i!=-1&&t.splice(i,1)},i.getParent=function(t,i){for(;t.parentNode&&t!=document.body;)if(t=t.parentNode,e(t,i))return t},i.getQueryElement=function(t){return"string"==typeof t?document.querySelector(t):t},i.handleEvent=function(t){var e="on"+t.type;this[e]&&this[e](t)},i.filterFindElements=function(t,n){t=i.makeArray(t);var s=[];return t.forEach(function(t){if(t instanceof HTMLElement){if(!n)return void s.push(t);e(t,n)&&s.push(t);for(var i=t.querySelectorAll(n),o=0;o<i.length;o++)s.push(i[o])}}),s},i.debounceMethod=function(t,e,i){i=i||100;var n=t.prototype[e],s=e+"Timeout";t.prototype[e]=function(){var t=this[s];clearTimeout(t);var e=arguments,o=this;this[s]=setTimeout(function(){n.apply(o,e),delete o[s]},i)}},i.docReady=function(t){var e=document.readyState;"complete"==e||"interactive"==e?setTimeout(t):document.addEventListener("DOMContentLoaded",t)},i.toDashed=function(t){return t.replace(/(.)([A-Z])/g,function(t,e,i){return e+"-"+i}).toLowerCase()};var s=t.console;return i.htmlInit=function(e,n){i.docReady(function(){var o=i.toDashed(n),r="data-"+o,a=document.querySelectorAll("["+r+"]"),l=document.querySelectorAll(".js-"+o),h=i.makeArray(a).concat(i.makeArray(l)),c=r+"-options",d=t.jQuery;h.forEach(function(t){var i,o=t.getAttribute(r)||t.getAttribute(c);try{i=o&&JSON.parse(o)}catch(a){return void(s&&s.error("Error parsing "+r+" on "+t.className+": "+a))}var l=new e(t,i);d&&d.data(t,n,l)})})},i}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/cell",["get-size/get-size"],function(i){return e(t,i)}):"object"==typeof module&&module.exports?module.exports=e(t,require("get-size")):(t.Flickity=t.Flickity||{},t.Flickity.Cell=e(t,t.getSize))}(window,function(t,e){function i(t,e){this.element=t,this.parent=e,this.create()}var n=i.prototype;return n.create=function(){this.element.style.position="absolute",this.element.setAttribute("aria-selected","false"),this.x=0,this.shift=0},n.destroy=function(){this.element.style.position="";var t=this.parent.originSide;this.element.removeAttribute("aria-selected"),this.element.style[t]=""},n.getSize=function(){this.size=e(this.element)},n.setPosition=function(t){this.x=t,this.updateTarget(),this.renderPosition(t)},n.updateTarget=n.setDefaultTarget=function(){var t="left"==this.parent.originSide?"marginLeft":"marginRight";this.target=this.x+this.size[t]+this.size.width*this.parent.cellAlign},n.renderPosition=function(t){var e=this.parent.originSide;this.element.style[e]=this.parent.getPositionValue(t)},n.wrapShift=function(t){this.shift=t,this.renderPosition(this.x+this.parent.slideableWidth*t)},n.remove=function(){this.element.parentNode.removeChild(this.element)},i}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/slide",e):"object"==typeof module&&module.exports?module.exports=e():(t.Flickity=t.Flickity||{},t.Flickity.Slide=e())}(window,function(){"use strict";function t(t){this.parent=t,this.isOriginLeft="left"==t.originSide,this.cells=[],this.outerWidth=0,this.height=0}var e=t.prototype;return e.addCell=function(t){if(this.cells.push(t),this.outerWidth+=t.size.outerWidth,this.height=Math.max(t.size.outerHeight,this.height),1==this.cells.length){this.x=t.x;var e=this.isOriginLeft?"marginLeft":"marginRight";this.firstMargin=t.size[e]}},e.updateTarget=function(){var t=this.isOriginLeft?"marginRight":"marginLeft",e=this.getLastCell(),i=e?e.size[t]:0,n=this.outerWidth-(this.firstMargin+i);this.target=this.x+this.firstMargin+n*this.parent.cellAlign},e.getLastCell=function(){return this.cells[this.cells.length-1]},e.select=function(){this.changeSelected(!0)},e.unselect=function(){this.changeSelected(!1)},e.changeSelected=function(t){var e=t?"add":"remove";this.cells.forEach(function(i){i.element.classList[e]("is-selected"),i.element.setAttribute("aria-selected",t.toString())})},e.getCellElements=function(){return this.cells.map(function(t){return t.element})},t}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/animate",["fizzy-ui-utils/utils"],function(i){return e(t,i)}):"object"==typeof module&&module.exports?module.exports=e(t,require("fizzy-ui-utils")):(t.Flickity=t.Flickity||{},t.Flickity.animatePrototype=e(t,t.fizzyUIUtils))}(window,function(t,e){var i={};return i.startAnimation=function(){this.isAnimating||(this.isAnimating=!0,this.restingFrames=0,this.animate())},i.animate=function(){this.applyDragForce(),this.applySelectedAttraction();var t=this.x;if(this.integratePhysics(),this.positionSlider(),this.settle(t),this.isAnimating){var e=this;requestAnimationFrame(function(){e.animate()})}},i.positionSlider=function(){var t=this.x;this.options.wrapAround&&this.cells.length>1&&(t=e.modulo(t,this.slideableWidth),t-=this.slideableWidth,this.shiftWrapCells(t)),t+=this.cursorPosition,t=this.options.rightToLeft?-t:t;var i=this.getPositionValue(t);this.slider.style.transform=this.isAnimating?"translate3d("+i+",0,0)":"translateX("+i+")";var n=this.slides[0];if(n){var s=-this.x-n.target,o=s/this.slidesWidth;this.dispatchEvent("scroll",null,[o,s])}},i.positionSliderAtSelected=function(){this.cells.length&&(this.x=-this.selectedSlide.target,this.velocity=0,this.positionSlider())},i.getPositionValue=function(t){return this.options.percentPosition?.01*Math.round(t/this.size.innerWidth*1e4)+"%":Math.round(t)+"px"},i.settle=function(t){this.isPointerDown||Math.round(100*this.x)!=Math.round(100*t)||this.restingFrames++,this.restingFrames>2&&(this.isAnimating=!1,delete this.isFreeScrolling,this.positionSlider(),this.dispatchEvent("settle",null,[this.selectedIndex]))},i.shiftWrapCells=function(t){var e=this.cursorPosition+t;this._shiftCells(this.beforeShiftCells,e,-1);var i=this.size.innerWidth-(t+this.slideableWidth+this.cursorPosition);this._shiftCells(this.afterShiftCells,i,1)},i._shiftCells=function(t,e,i){for(var n=0;n<t.length;n++){var s=t[n],o=e>0?i:0;s.wrapShift(o),e-=s.size.outerWidth}},i._unshiftCells=function(t){if(t&&t.length)for(var e=0;e<t.length;e++)t[e].wrapShift(0)},i.integratePhysics=function(){this.x+=this.velocity,this.velocity*=this.getFrictionFactor()},i.applyForce=function(t){this.velocity+=t},i.getFrictionFactor=function(){return 1-this.options[this.isFreeScrolling?"freeScrollFriction":"friction"]},i.getRestingPosition=function(){return this.x+this.velocity/(1-this.getFrictionFactor())},i.applyDragForce=function(){if(this.isDraggable&&this.isPointerDown){var t=this.dragX-this.x,e=t-this.velocity;this.applyForce(e)}},i.applySelectedAttraction=function(){var t=this.isDraggable&&this.isPointerDown;if(!t&&!this.isFreeScrolling&&this.slides.length){var e=this.selectedSlide.target*-1-this.x,i=e*this.options.selectedAttraction;this.applyForce(i)}},i}),function(t,e){if("function"==typeof define&&define.amd)define("flickity/js/flickity",["ev-emitter/ev-emitter","get-size/get-size","fizzy-ui-utils/utils","./cell","./slide","./animate"],function(i,n,s,o,r,a){return e(t,i,n,s,o,r,a)});else if("object"==typeof module&&module.exports)module.exports=e(t,require("ev-emitter"),require("get-size"),require("fizzy-ui-utils"),require("./cell"),require("./slide"),require("./animate"));else{var i=t.Flickity;t.Flickity=e(t,t.EvEmitter,t.getSize,t.fizzyUIUtils,i.Cell,i.Slide,i.animatePrototype)}}(window,function(t,e,i,n,s,o,r){function a(t,e){for(t=n.makeArray(t);t.length;)e.appendChild(t.shift())}function l(t,e){var i=n.getQueryElement(t);if(!i)return void(d&&d.error("Bad element for Flickity: "+(i||t)));if(this.element=i,this.element.flickityGUID){var s=f[this.element.flickityGUID];return s.option(e),s}h&&(this.$element=h(this.element)),this.options=n.extend({},this.constructor.defaults),this.option(e),this._create()}var h=t.jQuery,c=t.getComputedStyle,d=t.console,u=0,f={};l.defaults={accessibility:!0,cellAlign:"center",freeScrollFriction:.075,friction:.28,namespaceJQueryEvents:!0,percentPosition:!0,resize:!0,selectedAttraction:.025,setGallerySize:!0},l.createMethods=[];var p=l.prototype;n.extend(p,e.prototype),p._create=function(){var e=this.guid=++u;this.element.flickityGUID=e,f[e]=this,this.selectedIndex=0,this.restingFrames=0,this.x=0,this.velocity=0,this.originSide=this.options.rightToLeft?"right":"left",this.viewport=document.createElement("div"),this.viewport.className="flickity-viewport",this._createSlider(),(this.options.resize||this.options.watchCSS)&&t.addEventListener("resize",this);for(var i in this.options.on){var n=this.options.on[i];this.on(i,n)}l.createMethods.forEach(function(t){this[t]()},this),this.options.watchCSS?this.watchCSS():this.activate()},p.option=function(t){n.extend(this.options,t)},p.activate=function(){if(!this.isActive){this.isActive=!0,this.element.classList.add("flickity-enabled"),this.options.rightToLeft&&this.element.classList.add("flickity-rtl"),this.getSize();var t=this._filterFindCellElements(this.element.children);a(t,this.slider),this.viewport.appendChild(this.slider),this.element.appendChild(this.viewport),this.reloadCells(),this.options.accessibility&&(this.element.tabIndex=0,this.element.addEventListener("keydown",this)),this.emitEvent("activate");var e,i=this.options.initialIndex;e=this.isInitActivated?this.selectedIndex:void 0!==i&&this.cells[i]?i:0,this.select(e,!1,!0),this.isInitActivated=!0,this.dispatchEvent("ready")}},p._createSlider=function(){var t=document.createElement("div");t.className="flickity-slider",t.style[this.originSide]=0,this.slider=t},p._filterFindCellElements=function(t){return n.filterFindElements(t,this.options.cellSelector)},p.reloadCells=function(){this.cells=this._makeCells(this.slider.children),this.positionCells(),this._getWrapShiftCells(),this.setGallerySize()},p._makeCells=function(t){var e=this._filterFindCellElements(t),i=e.map(function(t){return new s(t,this)},this);return i},p.getLastCell=function(){return this.cells[this.cells.length-1]},p.getLastSlide=function(){return this.slides[this.slides.length-1]},p.positionCells=function(){this._sizeCells(this.cells),this._positionCells(0)},p._positionCells=function(t){t=t||0,this.maxCellHeight=t?this.maxCellHeight||0:0;var e=0;if(t>0){var i=this.cells[t-1];e=i.x+i.size.outerWidth}for(var n=this.cells.length,s=t;s<n;s++){var o=this.cells[s];o.setPosition(e),e+=o.size.outerWidth,this.maxCellHeight=Math.max(o.size.outerHeight,this.maxCellHeight)}this.slideableWidth=e,this.updateSlides(),this._containSlides(),this.slidesWidth=n?this.getLastSlide().target-this.slides[0].target:0},p._sizeCells=function(t){t.forEach(function(t){t.getSize()})},p.updateSlides=function(){if(this.slides=[],this.cells.length){var t=new o(this);this.slides.push(t);var e="left"==this.originSide,i=e?"marginRight":"marginLeft",n=this._getCanCellFit();this.cells.forEach(function(e,s){if(!t.cells.length)return void t.addCell(e);var r=t.outerWidth-t.firstMargin+(e.size.outerWidth-e.size[i]);n.call(this,s,r)?t.addCell(e):(t.updateTarget(),t=new o(this),this.slides.push(t),t.addCell(e))},this),t.updateTarget(),this.updateSelectedSlide()}},p._getCanCellFit=function(){var t=this.options.groupCells;if(!t)return function(){return!1};if("number"==typeof t){var e=parseInt(t,10);return function(t){return t%e!==0}}var i="string"==typeof t&&t.match(/^(\d+)%$/),n=i?parseInt(i[1],10)/100:1;return function(t,e){return e<=(this.size.innerWidth+1)*n}},p._init=p.reposition=function(){this.positionCells(),this.positionSliderAtSelected()},p.getSize=function(){this.size=i(this.element),this.setCellAlign(),this.cursorPosition=this.size.innerWidth*this.cellAlign};var g={center:{left:.5,right:.5},left:{left:0,right:1},right:{right:0,left:1}};return p.setCellAlign=function(){var t=g[this.options.cellAlign];this.cellAlign=t?t[this.originSide]:this.options.cellAlign},p.setGallerySize=function(){if(this.options.setGallerySize){var t=this.options.adaptiveHeight&&this.selectedSlide?this.selectedSlide.height:this.maxCellHeight;this.viewport.style.height=t+"px"}},p._getWrapShiftCells=function(){if(this.options.wrapAround){this._unshiftCells(this.beforeShiftCells),this._unshiftCells(this.afterShiftCells);var t=this.cursorPosition,e=this.cells.length-1;this.beforeShiftCells=this._getGapCells(t,e,-1),t=this.size.innerWidth-this.cursorPosition,this.afterShiftCells=this._getGapCells(t,0,1)}},p._getGapCells=function(t,e,i){for(var n=[];t>0;){var s=this.cells[e];if(!s)break;n.push(s),e+=i,t-=s.size.outerWidth}return n},p._containSlides=function(){if(this.options.contain&&!this.options.wrapAround&&this.cells.length){var t=this.options.rightToLeft,e=t?"marginRight":"marginLeft",i=t?"marginLeft":"marginRight",n=this.slideableWidth-this.getLastCell().size[i],s=n<this.size.innerWidth,o=this.cursorPosition+this.cells[0].size[e],r=n-this.size.innerWidth*(1-this.cellAlign);this.slides.forEach(function(t){s?t.target=n*this.cellAlign:(t.target=Math.max(t.target,o),t.target=Math.min(t.target,r))},this)}},p.dispatchEvent=function(t,e,i){var n=e?[e].concat(i):i;if(this.emitEvent(t,n),h&&this.$element){t+=this.options.namespaceJQueryEvents?".flickity":"";var s=t;if(e){var o=h.Event(e);o.type=t,s=o}this.$element.trigger(s,i)}},p.select=function(t,e,i){if(this.isActive&&(t=parseInt(t,10),this._wrapSelect(t),(this.options.wrapAround||e)&&(t=n.modulo(t,this.slides.length)),this.slides[t])){var s=this.selectedIndex;this.selectedIndex=t,this.updateSelectedSlide(),i?this.positionSliderAtSelected():this.startAnimation(),this.options.adaptiveHeight&&this.setGallerySize(),this.dispatchEvent("select",null,[t]),t!=s&&this.dispatchEvent("change",null,[t]),this.dispatchEvent("cellSelect")}},p._wrapSelect=function(t){var e=this.slides.length,i=this.options.wrapAround&&e>1;if(!i)return t;var s=n.modulo(t,e),o=Math.abs(s-this.selectedIndex),r=Math.abs(s+e-this.selectedIndex),a=Math.abs(s-e-this.selectedIndex);!this.isDragSelect&&r<o?t+=e:!this.isDragSelect&&a<o&&(t-=e),t<0?this.x-=this.slideableWidth:t>=e&&(this.x+=this.slideableWidth)},p.previous=function(t,e){this.select(this.selectedIndex-1,t,e)},p.next=function(t,e){this.select(this.selectedIndex+1,t,e)},p.updateSelectedSlide=function(){var t=this.slides[this.selectedIndex];t&&(this.unselectSelectedSlide(),this.selectedSlide=t,t.select(),this.selectedCells=t.cells,this.selectedElements=t.getCellElements(),this.selectedCell=t.cells[0],this.selectedElement=this.selectedElements[0])},p.unselectSelectedSlide=function(){this.selectedSlide&&this.selectedSlide.unselect()},p.selectCell=function(t,e,i){var n=this.queryCell(t);if(n){var s=this.getCellSlideIndex(n);this.select(s,e,i)}},p.getCellSlideIndex=function(t){for(var e=0;e<this.slides.length;e++){var i=this.slides[e],n=i.cells.indexOf(t);if(n!=-1)return e}},p.getCell=function(t){for(var e=0;e<this.cells.length;e++){var i=this.cells[e];if(i.element==t)return i}},p.getCells=function(t){t=n.makeArray(t);var e=[];return t.forEach(function(t){var i=this.getCell(t);i&&e.push(i)},this),e},p.getCellElements=function(){return this.cells.map(function(t){return t.element})},p.getParentCell=function(t){var e=this.getCell(t);return e?e:(t=n.getParent(t,".flickity-slider > *"),this.getCell(t))},p.getAdjacentCellElements=function(t,e){if(!t)return this.selectedSlide.getCellElements();e=void 0===e?this.selectedIndex:e;var i=this.slides.length;if(1+2*t>=i)return this.getCellElements();for(var s=[],o=e-t;o<=e+t;o++){var r=this.options.wrapAround?n.modulo(o,i):o,a=this.slides[r];a&&(s=s.concat(a.getCellElements()))}return s},p.queryCell=function(t){return"number"==typeof t?this.cells[t]:("string"==typeof t&&(t=this.element.querySelector(t)),this.getCell(t))},p.uiChange=function(){this.emitEvent("uiChange")},p.childUIPointerDown=function(t){this.emitEvent("childUIPointerDown",[t])},p.onresize=function(){this.watchCSS(),this.resize()},n.debounceMethod(l,"onresize",150),p.resize=function(){if(this.isActive){this.getSize(),this.options.wrapAround&&(this.x=n.modulo(this.x,this.slideableWidth)),this.positionCells(),this._getWrapShiftCells(),this.setGallerySize(),this.emitEvent("resize");var t=this.selectedElements&&this.selectedElements[0];this.selectCell(t,!1,!0)}},p.watchCSS=function(){var t=this.options.watchCSS;if(t){var e=c(this.element,":after").content;e.indexOf("flickity")!=-1?this.activate():this.deactivate()}},p.onkeydown=function(t){var e=document.activeElement&&document.activeElement!=this.element;if(this.options.accessibility&&!e){var i=l.keyboardHandlers[t.keyCode];i&&i.call(this)}},l.keyboardHandlers={37:function(){var t=this.options.rightToLeft?"next":"previous";this.uiChange(),this[t]()},39:function(){var t=this.options.rightToLeft?"previous":"next";this.uiChange(),this[t]()}},p.focus=function(){var e=t.pageYOffset;this.element.focus({preventScroll:!0}),t.pageYOffset!=e&&t.scrollTo(t.pageXOffset,e)},p.deactivate=function(){this.isActive&&(this.element.classList.remove("flickity-enabled"),this.element.classList.remove("flickity-rtl"),this.unselectSelectedSlide(),this.cells.forEach(function(t){t.destroy()}),this.element.removeChild(this.viewport),a(this.slider.children,this.element),this.options.accessibility&&(this.element.removeAttribute("tabIndex"),this.element.removeEventListener("keydown",this)),this.isActive=!1,this.emitEvent("deactivate"))},p.destroy=function(){this.deactivate(),t.removeEventListener("resize",this),this.emitEvent("destroy"),h&&this.$element&&h.removeData(this.element,"flickity"),delete this.element.flickityGUID,delete f[this.guid]},n.extend(p,r),l.data=function(t){t=n.getQueryElement(t);var e=t&&t.flickityGUID;return e&&f[e]},n.htmlInit(l,"flickity"),h&&h.bridget&&h.bridget("flickity",l),l.setJQuery=function(t){h=t},l.Cell=s,l}),function(t,e){"function"==typeof define&&define.amd?define("unipointer/unipointer",["ev-emitter/ev-emitter"],function(i){return e(t,i)}):"object"==typeof module&&module.exports?module.exports=e(t,require("ev-emitter")):t.Unipointer=e(t,t.EvEmitter)}(window,function(t,e){function i(){}function n(){}var s=n.prototype=Object.create(e.prototype);s.bindStartEvent=function(t){this._bindStartEvent(t,!0)},s.unbindStartEvent=function(t){this._bindStartEvent(t,!1)},s._bindStartEvent=function(e,i){i=void 0===i||i;var n=i?"addEventListener":"removeEventListener",s="mousedown";t.PointerEvent?s="pointerdown":"ontouchstart"in t&&(s="touchstart"),e[n](s,this)},s.handleEvent=function(t){var e="on"+t.type;this[e]&&this[e](t)},s.getTouch=function(t){for(var e=0;e<t.length;e++){var i=t[e];if(i.identifier==this.pointerIdentifier)return i}},s.onmousedown=function(t){var e=t.button;e&&0!==e&&1!==e||this._pointerDown(t,t)},s.ontouchstart=function(t){this._pointerDown(t,t.changedTouches[0])},s.onpointerdown=function(t){this._pointerDown(t,t)},s._pointerDown=function(t,e){t.button||this.isPointerDown||(this.isPointerDown=!0,this.pointerIdentifier=void 0!==e.pointerId?e.pointerId:e.identifier,this.pointerDown(t,e))},s.pointerDown=function(t,e){this._bindPostStartEvents(t),this.emitEvent("pointerDown",[t,e])};var o={mousedown:["mousemove","mouseup"],touchstart:["touchmove","touchend","touchcancel"],pointerdown:["pointermove","pointerup","pointercancel"]};return s._bindPostStartEvents=function(e){if(e){var i=o[e.type];i.forEach(function(e){t.addEventListener(e,this)},this),this._boundPointerEvents=i}},s._unbindPostStartEvents=function(){this._boundPointerEvents&&(this._boundPointerEvents.forEach(function(e){t.removeEventListener(e,this)},this),delete this._boundPointerEvents)},s.onmousemove=function(t){this._pointerMove(t,t)},s.onpointermove=function(t){t.pointerId==this.pointerIdentifier&&this._pointerMove(t,t)},s.ontouchmove=function(t){var e=this.getTouch(t.changedTouches);e&&this._pointerMove(t,e)},s._pointerMove=function(t,e){this.pointerMove(t,e)},s.pointerMove=function(t,e){this.emitEvent("pointerMove",[t,e])},s.onmouseup=function(t){this._pointerUp(t,t)},s.onpointerup=function(t){t.pointerId==this.pointerIdentifier&&this._pointerUp(t,t)},s.ontouchend=function(t){var e=this.getTouch(t.changedTouches);e&&this._pointerUp(t,e)},s._pointerUp=function(t,e){this._pointerDone(),this.pointerUp(t,e)},s.pointerUp=function(t,e){this.emitEvent("pointerUp",[t,e])},s._pointerDone=function(){this._pointerReset(),this._unbindPostStartEvents(),this.pointerDone()},s._pointerReset=function(){this.isPointerDown=!1,delete this.pointerIdentifier},s.pointerDone=i,s.onpointercancel=function(t){t.pointerId==this.pointerIdentifier&&this._pointerCancel(t,t)},s.ontouchcancel=function(t){var e=this.getTouch(t.changedTouches);e&&this._pointerCancel(t,e)},s._pointerCancel=function(t,e){this._pointerDone(),this.pointerCancel(t,e)},s.pointerCancel=function(t,e){this.emitEvent("pointerCancel",[t,e])},n.getPointerPoint=function(t){return{x:t.pageX,y:t.pageY}},n}),function(t,e){"function"==typeof define&&define.amd?define("unidragger/unidragger",["unipointer/unipointer"],function(i){return e(t,i)}):"object"==typeof module&&module.exports?module.exports=e(t,require("unipointer")):t.Unidragger=e(t,t.Unipointer)}(window,function(t,e){function i(){}var n=i.prototype=Object.create(e.prototype);n.bindHandles=function(){this._bindHandles(!0)},n.unbindHandles=function(){this._bindHandles(!1)},n._bindHandles=function(e){e=void 0===e||e;for(var i=e?"addEventListener":"removeEventListener",n=e?this._touchActionValue:"",s=0;s<this.handles.length;s++){var o=this.handles[s];this._bindStartEvent(o,e),o[i]("click",this),t.PointerEvent&&(o.style.touchAction=n)}},n._touchActionValue="none",n.pointerDown=function(t,e){var i=this.okayPointerDown(t);i&&(this.pointerDownPointer=e,t.preventDefault(),this.pointerDownBlur(),this._bindPostStartEvents(t),this.emitEvent("pointerDown",[t,e]))};var s={TEXTAREA:!0,INPUT:!0,SELECT:!0,OPTION:!0},o={radio:!0,checkbox:!0,button:!0,submit:!0,image:!0,file:!0};return n.okayPointerDown=function(t){var e=s[t.target.nodeName],i=o[t.target.type],n=!e||i;return n||this._pointerReset(),n},n.pointerDownBlur=function(){var t=document.activeElement,e=t&&t.blur&&t!=document.body;e&&t.blur()},n.pointerMove=function(t,e){var i=this._dragPointerMove(t,e);this.emitEvent("pointerMove",[t,e,i]),this._dragMove(t,e,i)},n._dragPointerMove=function(t,e){var i={x:e.pageX-this.pointerDownPointer.pageX,y:e.pageY-this.pointerDownPointer.pageY};return!this.isDragging&&this.hasDragStarted(i)&&this._dragStart(t,e),i},n.hasDragStarted=function(t){return Math.abs(t.x)>3||Math.abs(t.y)>3},n.pointerUp=function(t,e){this.emitEvent("pointerUp",[t,e]),this._dragPointerUp(t,e)},n._dragPointerUp=function(t,e){this.isDragging?this._dragEnd(t,e):this._staticClick(t,e)},n._dragStart=function(t,e){this.isDragging=!0,this.isPreventingClicks=!0,this.dragStart(t,e)},n.dragStart=function(t,e){this.emitEvent("dragStart",[t,e])},n._dragMove=function(t,e,i){this.isDragging&&this.dragMove(t,e,i)},n.dragMove=function(t,e,i){t.preventDefault(),this.emitEvent("dragMove",[t,e,i])},n._dragEnd=function(t,e){this.isDragging=!1,setTimeout(function(){delete this.isPreventingClicks}.bind(this)),this.dragEnd(t,e)},n.dragEnd=function(t,e){this.emitEvent("dragEnd",[t,e])},n.onclick=function(t){this.isPreventingClicks&&t.preventDefault()},n._staticClick=function(t,e){this.isIgnoringMouseUp&&"mouseup"==t.type||(this.staticClick(t,e),"mouseup"!=t.type&&(this.isIgnoringMouseUp=!0,setTimeout(function(){delete this.isIgnoringMouseUp}.bind(this),400)))},n.staticClick=function(t,e){this.emitEvent("staticClick",[t,e])},i.getPointerPoint=e.getPointerPoint,i}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/drag",["./flickity","unidragger/unidragger","fizzy-ui-utils/utils"],function(i,n,s){return e(t,i,n,s)}):"object"==typeof module&&module.exports?module.exports=e(t,require("./flickity"),require("unidragger"),require("fizzy-ui-utils")):t.Flickity=e(t,t.Flickity,t.Unidragger,t.fizzyUIUtils)}(window,function(t,e,i,n){function s(){return{x:t.pageXOffset,y:t.pageYOffset}}n.extend(e.defaults,{draggable:">1",dragThreshold:3}),e.createMethods.push("_createDrag");var o=e.prototype;n.extend(o,i.prototype),o._touchActionValue="pan-y";var r="createTouch"in document,a=!1;o._createDrag=function(){this.on("activate",this.onActivateDrag),this.on("uiChange",this._uiChangeDrag),this.on("childUIPointerDown",this._childUIPointerDownDrag),this.on("deactivate",this.onDeactivateDrag),this.on("cellChange",this.updateDraggable),r&&!a&&(t.addEventListener("touchmove",function(){}),a=!0)},o.onActivateDrag=function(){this.handles=[this.viewport],this.bindHandles(),this.updateDraggable()},o.onDeactivateDrag=function(){this.unbindHandles(),this.element.classList.remove("is-draggable")},o.updateDraggable=function(){">1"==this.options.draggable?this.isDraggable=this.slides.length>1:this.isDraggable=this.options.draggable,this.isDraggable?this.element.classList.add("is-draggable"):this.element.classList.remove("is-draggable")},o.bindDrag=function(){this.options.draggable=!0,this.updateDraggable()},o.unbindDrag=function(){this.options.draggable=!1,this.updateDraggable()},o._uiChangeDrag=function(){delete this.isFreeScrolling},o._childUIPointerDownDrag=function(t){t.preventDefault(),this.pointerDownFocus(t)},o.pointerDown=function(e,i){if(!this.isDraggable)return void this._pointerDownDefault(e,i);var n=this.okayPointerDown(e);n&&(this._pointerDownPreventDefault(e),this.pointerDownFocus(e),document.activeElement!=this.element&&this.pointerDownBlur(),this.dragX=this.x,this.viewport.classList.add("is-pointer-down"),this.pointerDownScroll=s(),t.addEventListener("scroll",this),this._pointerDownDefault(e,i))},o._pointerDownDefault=function(t,e){this.pointerDownPointer=e,this._bindPostStartEvents(t),this.dispatchEvent("pointerDown",t,[e])};var l={INPUT:!0,TEXTAREA:!0,SELECT:!0};return o.pointerDownFocus=function(t){var e=l[t.target.nodeName];e||this.focus()},o._pointerDownPreventDefault=function(t){var e="touchstart"==t.type,i="touch"==t.pointerType,n=l[t.target.nodeName];e||i||n||t.preventDefault()},o.hasDragStarted=function(t){return Math.abs(t.x)>this.options.dragThreshold},o.pointerUp=function(t,e){delete this.isTouchScrolling,this.viewport.classList.remove("is-pointer-down"),this.dispatchEvent("pointerUp",t,[e]),this._dragPointerUp(t,e)},o.pointerDone=function(){t.removeEventListener("scroll",this),delete this.pointerDownScroll},o.dragStart=function(e,i){this.isDraggable&&(this.dragStartPosition=this.x,this.startAnimation(),t.removeEventListener("scroll",this),this.dispatchEvent("dragStart",e,[i]))},o.pointerMove=function(t,e){var i=this._dragPointerMove(t,e);this.dispatchEvent("pointerMove",t,[e,i]),this._dragMove(t,e,i)},o.dragMove=function(t,e,i){if(this.isDraggable){t.preventDefault(),this.previousDragX=this.dragX;var n=this.options.rightToLeft?-1:1;this.options.wrapAround&&(i.x=i.x%this.slideableWidth);var s=this.dragStartPosition+i.x*n;if(!this.options.wrapAround&&this.slides.length){var o=Math.max(-this.slides[0].target,this.dragStartPosition);s=s>o?.5*(s+o):s;var r=Math.min(-this.getLastSlide().target,this.dragStartPosition);s=s<r?.5*(s+r):s}this.dragX=s,this.dragMoveTime=new Date,
this.dispatchEvent("dragMove",t,[e,i])}},o.dragEnd=function(t,e){if(this.isDraggable){this.options.freeScroll&&(this.isFreeScrolling=!0);var i=this.dragEndRestingSelect();if(this.options.freeScroll&&!this.options.wrapAround){var n=this.getRestingPosition();this.isFreeScrolling=-n>this.slides[0].target&&-n<this.getLastSlide().target}else this.options.freeScroll||i!=this.selectedIndex||(i+=this.dragEndBoostSelect());delete this.previousDragX,this.isDragSelect=this.options.wrapAround,this.select(i),delete this.isDragSelect,this.dispatchEvent("dragEnd",t,[e])}},o.dragEndRestingSelect=function(){var t=this.getRestingPosition(),e=Math.abs(this.getSlideDistance(-t,this.selectedIndex)),i=this._getClosestResting(t,e,1),n=this._getClosestResting(t,e,-1),s=i.distance<n.distance?i.index:n.index;return s},o._getClosestResting=function(t,e,i){for(var n=this.selectedIndex,s=1/0,o=this.options.contain&&!this.options.wrapAround?function(t,e){return t<=e}:function(t,e){return t<e};o(e,s)&&(n+=i,s=e,e=this.getSlideDistance(-t,n),null!==e);)e=Math.abs(e);return{distance:s,index:n-i}},o.getSlideDistance=function(t,e){var i=this.slides.length,s=this.options.wrapAround&&i>1,o=s?n.modulo(e,i):e,r=this.slides[o];if(!r)return null;var a=s?this.slideableWidth*Math.floor(e/i):0;return t-(r.target+a)},o.dragEndBoostSelect=function(){if(void 0===this.previousDragX||!this.dragMoveTime||new Date-this.dragMoveTime>100)return 0;var t=this.getSlideDistance(-this.dragX,this.selectedIndex),e=this.previousDragX-this.dragX;return t>0&&e>0?1:t<0&&e<0?-1:0},o.staticClick=function(t,e){var i=this.getParentCell(t.target),n=i&&i.element,s=i&&this.cells.indexOf(i);this.dispatchEvent("staticClick",t,[e,n,s])},o.onscroll=function(){var t=s(),e=this.pointerDownScroll.x-t.x,i=this.pointerDownScroll.y-t.y;(Math.abs(e)>3||Math.abs(i)>3)&&this._pointerDone()},e}),function(t,e){"function"==typeof define&&define.amd?define("tap-listener/tap-listener",["unipointer/unipointer"],function(i){return e(t,i)}):"object"==typeof module&&module.exports?module.exports=e(t,require("unipointer")):t.TapListener=e(t,t.Unipointer)}(window,function(t,e){function i(t){this.bindTap(t)}var n=i.prototype=Object.create(e.prototype);return n.bindTap=function(t){t&&(this.unbindTap(),this.tapElement=t,this._bindStartEvent(t,!0))},n.unbindTap=function(){this.tapElement&&(this._bindStartEvent(this.tapElement,!0),delete this.tapElement)},n.pointerUp=function(i,n){if(!this.isIgnoringMouseUp||"mouseup"!=i.type){var s=e.getPointerPoint(n),o=this.tapElement.getBoundingClientRect(),r=t.pageXOffset,a=t.pageYOffset,l=s.x>=o.left+r&&s.x<=o.right+r&&s.y>=o.top+a&&s.y<=o.bottom+a;if(l&&this.emitEvent("tap",[i,n]),"mouseup"!=i.type){this.isIgnoringMouseUp=!0;var h=this;setTimeout(function(){delete h.isIgnoringMouseUp},400)}}},n.destroy=function(){this.pointerDone(),this.unbindTap()},i}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/prev-next-button",["./flickity","tap-listener/tap-listener","fizzy-ui-utils/utils"],function(i,n,s){return e(t,i,n,s)}):"object"==typeof module&&module.exports?module.exports=e(t,require("./flickity"),require("tap-listener"),require("fizzy-ui-utils")):e(t,t.Flickity,t.TapListener,t.fizzyUIUtils)}(window,function(t,e,i,n){"use strict";function s(t,e){this.direction=t,this.parent=e,this._create()}function o(t){return"string"==typeof t?t:"M "+t.x0+",50 L "+t.x1+","+(t.y1+50)+" L "+t.x2+","+(t.y2+50)+" L "+t.x3+",50  L "+t.x2+","+(50-t.y2)+" L "+t.x1+","+(50-t.y1)+" Z"}var r="http://www.w3.org/2000/svg";s.prototype=Object.create(i.prototype),s.prototype._create=function(){this.isEnabled=!0,this.isPrevious=this.direction==-1;var t=this.parent.options.rightToLeft?1:-1;this.isLeft=this.direction==t;var e=this.element=document.createElement("button");e.className="flickity-button flickity-prev-next-button",e.className+=this.isPrevious?" previous":" next",e.setAttribute("type","button"),this.disable(),e.setAttribute("aria-label",this.isPrevious?"Previous":"Next");var i=this.createSVG();e.appendChild(i),this.on("tap",this.onTap),this.parent.on("select",this.update.bind(this)),this.on("pointerDown",this.parent.childUIPointerDown.bind(this.parent))},s.prototype.activate=function(){this.bindTap(this.element),this.element.addEventListener("click",this),this.parent.element.appendChild(this.element)},s.prototype.deactivate=function(){this.parent.element.removeChild(this.element),i.prototype.destroy.call(this),this.element.removeEventListener("click",this)},s.prototype.createSVG=function(){var t=document.createElementNS(r,"svg");t.setAttribute("class","flickity-button-icon"),t.setAttribute("viewBox","0 0 100 100");var e=document.createElementNS(r,"path"),i=o(this.parent.options.arrowShape);return e.setAttribute("d",i),e.setAttribute("class","arrow"),this.isLeft||e.setAttribute("transform","translate(100, 100) rotate(180) "),t.appendChild(e),t},s.prototype.onTap=function(){if(this.isEnabled){this.parent.uiChange();var t=this.isPrevious?"previous":"next";this.parent[t]()}},s.prototype.handleEvent=n.handleEvent,s.prototype.onclick=function(t){var e=document.activeElement;e&&e==this.element&&this.onTap(t,t)},s.prototype.enable=function(){this.isEnabled||(this.element.disabled=!1,this.isEnabled=!0)},s.prototype.disable=function(){this.isEnabled&&(this.element.disabled=!0,this.isEnabled=!1)},s.prototype.update=function(){var t=this.parent.slides;if(this.parent.options.wrapAround&&t.length>1)return void this.enable();var e=t.length?t.length-1:0,i=this.isPrevious?0:e,n=this.parent.selectedIndex==i?"disable":"enable";this[n]()},s.prototype.destroy=function(){this.deactivate()},n.extend(e.defaults,{prevNextButtons:!0,arrowShape:{x0:10,x1:60,y1:50,x2:70,y2:40,x3:30}}),e.createMethods.push("_createPrevNextButtons");var a=e.prototype;return a._createPrevNextButtons=function(){this.options.prevNextButtons&&(this.prevButton=new s((-1),this),this.nextButton=new s(1,this),this.on("activate",this.activatePrevNextButtons))},a.activatePrevNextButtons=function(){this.prevButton.activate(),this.nextButton.activate(),this.on("deactivate",this.deactivatePrevNextButtons)},a.deactivatePrevNextButtons=function(){this.prevButton.deactivate(),this.nextButton.deactivate(),this.off("deactivate",this.deactivatePrevNextButtons)},e.PrevNextButton=s,e}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/page-dots",["./flickity","tap-listener/tap-listener","fizzy-ui-utils/utils"],function(i,n,s){return e(t,i,n,s)}):"object"==typeof module&&module.exports?module.exports=e(t,require("./flickity"),require("tap-listener"),require("fizzy-ui-utils")):e(t,t.Flickity,t.TapListener,t.fizzyUIUtils)}(window,function(t,e,i,n){function s(t){this.parent=t,this._create()}s.prototype=new i,s.prototype._create=function(){this.holder=document.createElement("ol"),this.holder.className="flickity-page-dots",this.dots=[],this.on("tap",this.onTap),this.on("pointerDown",this.parent.childUIPointerDown.bind(this.parent))},s.prototype.activate=function(){this.setDots(),this.bindTap(this.holder),this.parent.element.appendChild(this.holder)},s.prototype.deactivate=function(){this.parent.element.removeChild(this.holder),i.prototype.destroy.call(this)},s.prototype.setDots=function(){var t=this.parent.slides.length-this.dots.length;t>0?this.addDots(t):t<0&&this.removeDots(-t)},s.prototype.addDots=function(t){for(var e=document.createDocumentFragment(),i=[],n=this.dots.length,s=n+t,o=n;o<s;o++){var r=document.createElement("li");r.className="dot",r.setAttribute("aria-label","Page dot "+(o+1)),e.appendChild(r),i.push(r)}this.holder.appendChild(e),this.dots=this.dots.concat(i)},s.prototype.removeDots=function(t){var e=this.dots.splice(this.dots.length-t,t);e.forEach(function(t){this.holder.removeChild(t)},this)},s.prototype.updateSelected=function(){this.selectedDot&&(this.selectedDot.className="dot",this.selectedDot.removeAttribute("aria-current")),this.dots.length&&(this.selectedDot=this.dots[this.parent.selectedIndex],this.selectedDot.className="dot is-selected",this.selectedDot.setAttribute("aria-current","step"))},s.prototype.onTap=function(t){var e=t.target;if("LI"==e.nodeName){this.parent.uiChange();var i=this.dots.indexOf(e);this.parent.select(i)}},s.prototype.destroy=function(){this.deactivate()},e.PageDots=s,n.extend(e.defaults,{pageDots:!0}),e.createMethods.push("_createPageDots");var o=e.prototype;return o._createPageDots=function(){this.options.pageDots&&(this.pageDots=new s(this),this.on("activate",this.activatePageDots),this.on("select",this.updateSelectedPageDots),this.on("cellChange",this.updatePageDots),this.on("resize",this.updatePageDots),this.on("deactivate",this.deactivatePageDots))},o.activatePageDots=function(){this.pageDots.activate()},o.updateSelectedPageDots=function(){this.pageDots.updateSelected()},o.updatePageDots=function(){this.pageDots.setDots()},o.deactivatePageDots=function(){this.pageDots.deactivate()},e.PageDots=s,e}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/player",["ev-emitter/ev-emitter","fizzy-ui-utils/utils","./flickity"],function(t,i,n){return e(t,i,n)}):"object"==typeof module&&module.exports?module.exports=e(require("ev-emitter"),require("fizzy-ui-utils"),require("./flickity")):e(t.EvEmitter,t.fizzyUIUtils,t.Flickity)}(window,function(t,e,i){function n(t){this.parent=t,this.state="stopped",this.onVisibilityChange=this.visibilityChange.bind(this),this.onVisibilityPlay=this.visibilityPlay.bind(this)}n.prototype=Object.create(t.prototype),n.prototype.play=function(){if("playing"!=this.state){var t=document.hidden;if(t)return void document.addEventListener("visibilitychange",this.onVisibilityPlay);this.state="playing",document.addEventListener("visibilitychange",this.onVisibilityChange),this.tick()}},n.prototype.tick=function(){if("playing"==this.state){var t=this.parent.options.autoPlay;t="number"==typeof t?t:3e3;var e=this;this.clear(),this.timeout=setTimeout(function(){e.parent.next(!0),e.tick()},t)}},n.prototype.stop=function(){this.state="stopped",this.clear(),document.removeEventListener("visibilitychange",this.onVisibilityChange)},n.prototype.clear=function(){clearTimeout(this.timeout)},n.prototype.pause=function(){"playing"==this.state&&(this.state="paused",this.clear())},n.prototype.unpause=function(){"paused"==this.state&&this.play()},n.prototype.visibilityChange=function(){var t=document.hidden;this[t?"pause":"unpause"]()},n.prototype.visibilityPlay=function(){this.play(),document.removeEventListener("visibilitychange",this.onVisibilityPlay)},e.extend(i.defaults,{pauseAutoPlayOnHover:!0}),i.createMethods.push("_createPlayer");var s=i.prototype;return s._createPlayer=function(){this.player=new n(this),this.on("activate",this.activatePlayer),this.on("uiChange",this.stopPlayer),this.on("pointerDown",this.stopPlayer),this.on("deactivate",this.deactivatePlayer)},s.activatePlayer=function(){this.options.autoPlay&&(this.player.play(),this.element.addEventListener("mouseenter",this))},s.playPlayer=function(){this.player.play()},s.stopPlayer=function(){this.player.stop()},s.pausePlayer=function(){this.player.pause()},s.unpausePlayer=function(){this.player.unpause()},s.deactivatePlayer=function(){this.player.stop(),this.element.removeEventListener("mouseenter",this)},s.onmouseenter=function(){this.options.pauseAutoPlayOnHover&&(this.player.pause(),this.element.addEventListener("mouseleave",this))},s.onmouseleave=function(){this.player.unpause(),this.element.removeEventListener("mouseleave",this)},i.Player=n,i}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/add-remove-cell",["./flickity","fizzy-ui-utils/utils"],function(i,n){return e(t,i,n)}):"object"==typeof module&&module.exports?module.exports=e(t,require("./flickity"),require("fizzy-ui-utils")):e(t,t.Flickity,t.fizzyUIUtils)}(window,function(t,e,i){function n(t){var e=document.createDocumentFragment();return t.forEach(function(t){e.appendChild(t.element)}),e}var s=e.prototype;return s.insert=function(t,e){var i=this._makeCells(t);if(i&&i.length){var s=this.cells.length;e=void 0===e?s:e;var o=n(i),r=e==s;if(r)this.slider.appendChild(o);else{var a=this.cells[e].element;this.slider.insertBefore(o,a)}if(0===e)this.cells=i.concat(this.cells);else if(r)this.cells=this.cells.concat(i);else{var l=this.cells.splice(e,s-e);this.cells=this.cells.concat(i).concat(l)}this._sizeCells(i),this.cellChange(e,!0)}},s.append=function(t){this.insert(t,this.cells.length)},s.prepend=function(t){this.insert(t,0)},s.remove=function(t){var e=this.getCells(t);if(e&&e.length){var n=this.cells.length-1;e.forEach(function(t){t.remove();var e=this.cells.indexOf(t);n=Math.min(e,n),i.removeFrom(this.cells,t)},this),this.cellChange(n,!0)}},s.cellSizeChange=function(t){var e=this.getCell(t);if(e){e.getSize();var i=this.cells.indexOf(e);this.cellChange(i)}},s.cellChange=function(t,e){var i=this.selectedElement;this._positionCells(t),this._getWrapShiftCells(),this.setGallerySize();var n=this.getCell(i);n&&(this.selectedIndex=this.getCellSlideIndex(n)),this.selectedIndex=Math.min(this.slides.length-1,this.selectedIndex),this.emitEvent("cellChange",[t]),this.select(this.selectedIndex),e&&this.positionSliderAtSelected()},e}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/lazyload",["./flickity","fizzy-ui-utils/utils"],function(i,n){return e(t,i,n)}):"object"==typeof module&&module.exports?module.exports=e(t,require("./flickity"),require("fizzy-ui-utils")):e(t,t.Flickity,t.fizzyUIUtils)}(window,function(t,e,i){"use strict";function n(t){if("IMG"==t.nodeName){var e=t.getAttribute("data-flickity-lazyload"),n=t.getAttribute("data-flickity-lazyload-src"),s=t.getAttribute("data-flickity-lazyload-srcset");if(e||n||s)return[t]}var o="img[data-flickity-lazyload], img[data-flickity-lazyload-src], img[data-flickity-lazyload-srcset]",r=t.querySelectorAll(o);return i.makeArray(r)}function s(t,e){this.img=t,this.flickity=e,this.load()}e.createMethods.push("_createLazyload");var o=e.prototype;return o._createLazyload=function(){this.on("select",this.lazyLoad)},o.lazyLoad=function(){var t=this.options.lazyLoad;if(t){var e="number"==typeof t?t:0,i=this.getAdjacentCellElements(e),o=[];i.forEach(function(t){var e=n(t);o=o.concat(e)}),o.forEach(function(t){new s(t,this)},this)}},s.prototype.handleEvent=i.handleEvent,s.prototype.load=function(){this.img.addEventListener("load",this),this.img.addEventListener("error",this);var t=this.img.getAttribute("data-flickity-lazyload")||this.img.getAttribute("data-flickity-lazyload-src"),e=this.img.getAttribute("data-flickity-lazyload-srcset");this.img.src=t,e&&this.img.setAttribute("srcset",e),this.img.removeAttribute("data-flickity-lazyload"),this.img.removeAttribute("data-flickity-lazyload-src"),this.img.removeAttribute("data-flickity-lazyload-srcset")},s.prototype.onload=function(t){this.complete(t,"flickity-lazyloaded")},s.prototype.onerror=function(t){this.complete(t,"flickity-lazyerror")},s.prototype.complete=function(t,e){this.img.removeEventListener("load",this),this.img.removeEventListener("error",this);var i=this.flickity.getParentCell(this.img),n=i&&i.element;this.flickity.cellSizeChange(n),this.img.classList.add(e),this.flickity.dispatchEvent("lazyLoad",t,n)},e.LazyLoader=s,e}),function(t,e){"function"==typeof define&&define.amd?define("flickity/js/index",["./flickity","./drag","./prev-next-button","./page-dots","./player","./add-remove-cell","./lazyload"],e):"object"==typeof module&&module.exports&&(module.exports=e(require("./flickity"),require("./drag"),require("./prev-next-button"),require("./page-dots"),require("./player"),require("./add-remove-cell"),require("./lazyload")))}(window,function(t){return t}),function(t,e){"function"==typeof define&&define.amd?define("flickity-as-nav-for/as-nav-for",["flickity/js/index","fizzy-ui-utils/utils"],e):"object"==typeof module&&module.exports?module.exports=e(require("flickity"),require("fizzy-ui-utils")):t.Flickity=e(t.Flickity,t.fizzyUIUtils)}(window,function(t,e){function i(t,e,i){return(e-t)*i+t}t.createMethods.push("_createAsNavFor");var n=t.prototype;return n._createAsNavFor=function(){this.on("activate",this.activateAsNavFor),this.on("deactivate",this.deactivateAsNavFor),this.on("destroy",this.destroyAsNavFor);var t=this.options.asNavFor;if(t){var e=this;setTimeout(function(){e.setNavCompanion(t)})}},n.setNavCompanion=function(i){i=e.getQueryElement(i);var n=t.data(i);if(n&&n!=this){this.navCompanion=n;var s=this;this.onNavCompanionSelect=function(){s.navCompanionSelect()},n.on("select",this.onNavCompanionSelect),this.on("staticClick",this.onNavStaticClick),this.navCompanionSelect(!0)}},n.navCompanionSelect=function(t){if(this.navCompanion){var e=this.navCompanion.selectedCells[0],n=this.navCompanion.cells.indexOf(e),s=n+this.navCompanion.selectedCells.length-1,o=Math.floor(i(n,s,this.navCompanion.cellAlign));if(this.selectCell(o,!1,t),this.removeNavSelectedElements(),!(o>=this.cells.length)){var r=this.cells.slice(n,s+1);this.navSelectedElements=r.map(function(t){return t.element}),this.changeNavSelectedClass("add")}}},n.changeNavSelectedClass=function(t){this.navSelectedElements.forEach(function(e){e.classList[t]("is-nav-selected")})},n.activateAsNavFor=function(){this.navCompanionSelect(!0)},n.removeNavSelectedElements=function(){this.navSelectedElements&&(this.changeNavSelectedClass("remove"),delete this.navSelectedElements)},n.onNavStaticClick=function(t,e,i,n){"number"==typeof n&&this.navCompanion.selectCell(n)},n.deactivateAsNavFor=function(){this.removeNavSelectedElements()},n.destroyAsNavFor=function(){this.navCompanion&&(this.navCompanion.off("select",this.onNavCompanionSelect),this.off("staticClick",this.onNavStaticClick),delete this.navCompanion)},t}),function(t,e){"use strict";"function"==typeof define&&define.amd?define("imagesloaded/imagesloaded",["ev-emitter/ev-emitter"],function(i){return e(t,i)}):"object"==typeof module&&module.exports?module.exports=e(t,require("ev-emitter")):t.imagesLoaded=e(t,t.EvEmitter)}("undefined"!=typeof window?window:this,function(t,e){function i(t,e){for(var i in e)t[i]=e[i];return t}function n(t){if(Array.isArray(t))return t;var e="object"==typeof t&&"number"==typeof t.length;return e?h.call(t):[t]}function s(t,e,o){if(!(this instanceof s))return new s(t,e,o);var r=t;return"string"==typeof t&&(r=document.querySelectorAll(t)),r?(this.elements=n(r),this.options=i({},this.options),"function"==typeof e?o=e:i(this.options,e),o&&this.on("always",o),this.getImages(),a&&(this.jqDeferred=new a.Deferred),void setTimeout(this.check.bind(this))):void l.error("Bad element for imagesLoaded "+(r||t))}function o(t){this.img=t}function r(t,e){this.url=t,this.element=e,this.img=new Image}var a=t.jQuery,l=t.console,h=Array.prototype.slice;s.prototype=Object.create(e.prototype),s.prototype.options={},s.prototype.getImages=function(){this.images=[],this.elements.forEach(this.addElementImages,this)},s.prototype.addElementImages=function(t){"IMG"==t.nodeName&&this.addImage(t),this.options.background===!0&&this.addElementBackgroundImages(t);var e=t.nodeType;if(e&&c[e]){for(var i=t.querySelectorAll("img"),n=0;n<i.length;n++){var s=i[n];this.addImage(s)}if("string"==typeof this.options.background){var o=t.querySelectorAll(this.options.background);for(n=0;n<o.length;n++){var r=o[n];this.addElementBackgroundImages(r)}}}};var c={1:!0,9:!0,11:!0};return s.prototype.addElementBackgroundImages=function(t){var e=getComputedStyle(t);if(e)for(var i=/url\((['"])?(.*?)\1\)/gi,n=i.exec(e.backgroundImage);null!==n;){var s=n&&n[2];s&&this.addBackground(s,t),n=i.exec(e.backgroundImage)}},s.prototype.addImage=function(t){var e=new o(t);this.images.push(e)},s.prototype.addBackground=function(t,e){var i=new r(t,e);this.images.push(i)},s.prototype.check=function(){function t(t,i,n){setTimeout(function(){e.progress(t,i,n)})}var e=this;return this.progressedCount=0,this.hasAnyBroken=!1,this.images.length?void this.images.forEach(function(e){e.once("progress",t),e.check()}):void this.complete()},s.prototype.progress=function(t,e,i){this.progressedCount++,this.hasAnyBroken=this.hasAnyBroken||!t.isLoaded,this.emitEvent("progress",[this,t,e]),this.jqDeferred&&this.jqDeferred.notify&&this.jqDeferred.notify(this,t),this.progressedCount==this.images.length&&this.complete(),this.options.debug&&l&&l.log("progress: "+i,t,e)},s.prototype.complete=function(){var t=this.hasAnyBroken?"fail":"done";if(this.isComplete=!0,this.emitEvent(t,[this]),this.emitEvent("always",[this]),this.jqDeferred){var e=this.hasAnyBroken?"reject":"resolve";this.jqDeferred[e](this)}},o.prototype=Object.create(e.prototype),o.prototype.check=function(){var t=this.getIsImageComplete();return t?void this.confirm(0!==this.img.naturalWidth,"naturalWidth"):(this.proxyImage=new Image,this.proxyImage.addEventListener("load",this),this.proxyImage.addEventListener("error",this),this.img.addEventListener("load",this),this.img.addEventListener("error",this),void(this.proxyImage.src=this.img.src))},o.prototype.getIsImageComplete=function(){return this.img.complete&&this.img.naturalWidth},o.prototype.confirm=function(t,e){this.isLoaded=t,this.emitEvent("progress",[this,this.img,e])},o.prototype.handleEvent=function(t){var e="on"+t.type;this[e]&&this[e](t)},o.prototype.onload=function(){this.confirm(!0,"onload"),this.unbindEvents()},o.prototype.onerror=function(){this.confirm(!1,"onerror"),this.unbindEvents()},o.prototype.unbindEvents=function(){this.proxyImage.removeEventListener("load",this),this.proxyImage.removeEventListener("error",this),this.img.removeEventListener("load",this),this.img.removeEventListener("error",this)},r.prototype=Object.create(o.prototype),r.prototype.check=function(){this.img.addEventListener("load",this),this.img.addEventListener("error",this),this.img.src=this.url;var t=this.getIsImageComplete();t&&(this.confirm(0!==this.img.naturalWidth,"naturalWidth"),this.unbindEvents())},r.prototype.unbindEvents=function(){this.img.removeEventListener("load",this),this.img.removeEventListener("error",this)},r.prototype.confirm=function(t,e){this.isLoaded=t,this.emitEvent("progress",[this,this.element,e])},s.makeJQueryPlugin=function(e){e=e||t.jQuery,e&&(a=e,a.fn.imagesLoaded=function(t,e){var i=new s(this,t,e);return i.jqDeferred.promise(a(this))})},s.makeJQueryPlugin(),s}),function(t,e){"function"==typeof define&&define.amd?define(["flickity/js/index","imagesloaded/imagesloaded"],function(i,n){return e(t,i,n)}):"object"==typeof module&&module.exports?module.exports=e(t,require("flickity"),require("imagesloaded")):t.Flickity=e(t,t.Flickity,t.imagesLoaded)}(window,function(t,e,i){"use strict";e.createMethods.push("_createImagesLoaded");var n=e.prototype;return n._createImagesLoaded=function(){this.on("activate",this.imagesLoaded)},n.imagesLoaded=function(){function t(t,i){var n=e.getParentCell(i.img);e.cellSizeChange(n&&n.element),e.options.freeScroll||e.positionSliderAtSelected()}if(this.options.imagesLoaded){var e=this;i(this.slider).on("progress",t)}},e});

/*
	 _ _      _       _
 ___| (_) ___| | __  (_)___
/ __| | |/ __| |/ /  | / __|
\__ \ | | (__|   < _ | \__ \
|___/_|_|\___|_|\_(_)/ |___/
				   |__/

 Version: 1.9.0
  Author: Ken Wheeler
 Website: http://kenwheeler.github.io
	Docs: http://kenwheeler.github.io/slick
	Repo: http://github.com/kenwheeler/slick
  Issues: http://github.com/kenwheeler/slick/issues

 */
(function(i){"use strict";"function"==typeof define&&define.amd?define(["jquery"],i):"undefined"!=typeof exports?module.exports=i(require("jquery")):i(jQuery)})(function(i){"use strict";var e=window.Slick||{};e=function(){function e(e,o){var s,n=this;n.defaults={accessibility:!0,adaptiveHeight:!1,appendArrows:i(e),appendDots:i(e),arrows:!0,asNavFor:null,prevArrow:'<button class="slick-prev" aria-label="Previous" type="button">Previous</button>',nextArrow:'<button class="slick-next" aria-label="Next" type="button">Next</button>',autoplay:!1,autoplaySpeed:3e3,centerMode:!1,centerPadding:"50px",cssEase:"ease",customPaging:function(e,t){return i('<button type="button" />').text(t+1)},dots:!1,dotsClass:"slick-dots",draggable:!0,easing:"linear",edgeFriction:.35,fade:!1,focusOnSelect:!1,focusOnChange:!1,infinite:!0,initialSlide:0,lazyLoad:"ondemand",mobileFirst:!1,pauseOnHover:!0,pauseOnFocus:!0,pauseOnDotsHover:!1,respondTo:"window",responsive:null,rows:1,rtl:!1,slide:"",slidesPerRow:1,slidesToShow:1,slidesToScroll:1,speed:500,swipe:!0,swipeToSlide:!1,touchMove:!0,touchThreshold:5,useCSS:!0,useTransform:!0,variableWidth:!1,vertical:!1,verticalSwiping:!1,waitForAnimate:!0,zIndex:1e3},n.initials={animating:!1,dragging:!1,autoPlayTimer:null,currentDirection:0,currentLeft:null,currentSlide:0,direction:1,$dots:null,listWidth:null,listHeight:null,loadIndex:0,$nextArrow:null,$prevArrow:null,scrolling:!1,slideCount:null,slideWidth:null,$slideTrack:null,$slides:null,sliding:!1,slideOffset:0,swipeLeft:null,swiping:!1,$list:null,touchObject:{},transformsEnabled:!1,unslicked:!1},i.extend(n,n.initials),n.activeBreakpoint=null,n.animType=null,n.animProp=null,n.breakpoints=[],n.breakpointSettings=[],n.cssTransitions=!1,n.focussed=!1,n.interrupted=!1,n.hidden="hidden",n.paused=!0,n.positionProp=null,n.respondTo=null,n.rowCount=1,n.shouldClick=!0,n.$slider=i(e),n.$slidesCache=null,n.transformType=null,n.transitionType=null,n.visibilityChange="visibilitychange",n.windowWidth=0,n.windowTimer=null,s=i(e).data("slick")||{},n.options=i.extend({},n.defaults,o,s),n.currentSlide=n.options.initialSlide,n.originalSettings=n.options,"undefined"!=typeof document.mozHidden?(n.hidden="mozHidden",n.visibilityChange="mozvisibilitychange"):"undefined"!=typeof document.webkitHidden&&(n.hidden="webkitHidden",n.visibilityChange="webkitvisibilitychange"),n.autoPlay=i.proxy(n.autoPlay,n),n.autoPlayClear=i.proxy(n.autoPlayClear,n),n.autoPlayIterator=i.proxy(n.autoPlayIterator,n),n.changeSlide=i.proxy(n.changeSlide,n),n.clickHandler=i.proxy(n.clickHandler,n),n.selectHandler=i.proxy(n.selectHandler,n),n.setPosition=i.proxy(n.setPosition,n),n.swipeHandler=i.proxy(n.swipeHandler,n),n.dragHandler=i.proxy(n.dragHandler,n),n.keyHandler=i.proxy(n.keyHandler,n),n.instanceUid=t++,n.htmlExpr=/^(?:\s*(<[\w\W]+>)[^>]*)$/,n.registerBreakpoints(),n.init(!0)}var t=0;return e}(),e.prototype.activateADA=function(){var i=this;i.$slideTrack.find(".slick-active").attr({"aria-hidden":"false"}).find("a, input, button, select").attr({tabindex:"0"})},e.prototype.addSlide=e.prototype.slickAdd=function(e,t,o){var s=this;if("boolean"==typeof t)o=t,t=null;else if(t<0||t>=s.slideCount)return!1;s.unload(),"number"==typeof t?0===t&&0===s.$slides.length?i(e).appendTo(s.$slideTrack):o?i(e).insertBefore(s.$slides.eq(t)):i(e).insertAfter(s.$slides.eq(t)):o===!0?i(e).prependTo(s.$slideTrack):i(e).appendTo(s.$slideTrack),s.$slides=s.$slideTrack.children(this.options.slide),s.$slideTrack.children(this.options.slide).detach(),s.$slideTrack.append(s.$slides),s.$slides.each(function(e,t){i(t).attr("data-slick-index",e)}),s.$slidesCache=s.$slides,s.reinit()},e.prototype.animateHeight=function(){var i=this;if(1===i.options.slidesToShow&&i.options.adaptiveHeight===!0&&i.options.vertical===!1){var e=i.$slides.eq(i.currentSlide).outerHeight(!0);i.$list.animate({height:e},i.options.speed)}},e.prototype.animateSlide=function(e,t){var o={},s=this;s.animateHeight(),s.options.rtl===!0&&s.options.vertical===!1&&(e=-e),s.transformsEnabled===!1?s.options.vertical===!1?s.$slideTrack.animate({left:e},s.options.speed,s.options.easing,t):s.$slideTrack.animate({top:e},s.options.speed,s.options.easing,t):s.cssTransitions===!1?(s.options.rtl===!0&&(s.currentLeft=-s.currentLeft),i({animStart:s.currentLeft}).animate({animStart:e},{duration:s.options.speed,easing:s.options.easing,step:function(i){i=Math.ceil(i),s.options.vertical===!1?(o[s.animType]="translate("+i+"px, 0px)",s.$slideTrack.css(o)):(o[s.animType]="translate(0px,"+i+"px)",s.$slideTrack.css(o))},complete:function(){t&&t.call()}})):(s.applyTransition(),e=Math.ceil(e),s.options.vertical===!1?o[s.animType]="translate3d("+e+"px, 0px, 0px)":o[s.animType]="translate3d(0px,"+e+"px, 0px)",s.$slideTrack.css(o),t&&setTimeout(function(){s.disableTransition(),t.call()},s.options.speed))},e.prototype.getNavTarget=function(){var e=this,t=e.options.asNavFor;return t&&null!==t&&(t=i(t).not(e.$slider)),t},e.prototype.asNavFor=function(e){var t=this,o=t.getNavTarget();null!==o&&"object"==typeof o&&o.each(function(){var t=i(this).slick("getSlick");t.unslicked||t.slideHandler(e,!0)})},e.prototype.applyTransition=function(i){var e=this,t={};e.options.fade===!1?t[e.transitionType]=e.transformType+" "+e.options.speed+"ms "+e.options.cssEase:t[e.transitionType]="opacity "+e.options.speed+"ms "+e.options.cssEase,e.options.fade===!1?e.$slideTrack.css(t):e.$slides.eq(i).css(t)},e.prototype.autoPlay=function(){var i=this;i.autoPlayClear(),i.slideCount>i.options.slidesToShow&&(i.autoPlayTimer=setInterval(i.autoPlayIterator,i.options.autoplaySpeed))},e.prototype.autoPlayClear=function(){var i=this;i.autoPlayTimer&&clearInterval(i.autoPlayTimer)},e.prototype.autoPlayIterator=function(){var i=this,e=i.currentSlide+i.options.slidesToScroll;i.paused||i.interrupted||i.focussed||(i.options.infinite===!1&&(1===i.direction&&i.currentSlide+1===i.slideCount-1?i.direction=0:0===i.direction&&(e=i.currentSlide-i.options.slidesToScroll,i.currentSlide-1===0&&(i.direction=1))),i.slideHandler(e))},e.prototype.buildArrows=function(){var e=this;e.options.arrows===!0&&(e.$prevArrow=i(e.options.prevArrow).addClass("slick-arrow"),e.$nextArrow=i(e.options.nextArrow).addClass("slick-arrow"),e.slideCount>e.options.slidesToShow?(e.$prevArrow.removeClass("slick-hidden").removeAttr("aria-hidden tabindex"),e.$nextArrow.removeClass("slick-hidden").removeAttr("aria-hidden tabindex"),e.htmlExpr.test(e.options.prevArrow)&&e.$prevArrow.prependTo(e.options.appendArrows),e.htmlExpr.test(e.options.nextArrow)&&e.$nextArrow.appendTo(e.options.appendArrows),e.options.infinite!==!0&&e.$prevArrow.addClass("slick-disabled").attr("aria-disabled","true")):e.$prevArrow.add(e.$nextArrow).addClass("slick-hidden").attr({"aria-disabled":"true",tabindex:"-1"}))},e.prototype.buildDots=function(){var e,t,o=this;if(o.options.dots===!0&&o.slideCount>o.options.slidesToShow){for(o.$slider.addClass("slick-dotted"),t=i("<ul />").addClass(o.options.dotsClass),e=0;e<=o.getDotCount();e+=1)t.append(i("<li />").append(o.options.customPaging.call(this,o,e)));o.$dots=t.appendTo(o.options.appendDots),o.$dots.find("li").first().addClass("slick-active")}},e.prototype.buildOut=function(){var e=this;e.$slides=e.$slider.children(e.options.slide+":not(.slick-cloned)").addClass("slick-slide"),e.slideCount=e.$slides.length,e.$slides.each(function(e,t){i(t).attr("data-slick-index",e).data("originalStyling",i(t).attr("style")||"")}),e.$slider.addClass("slick-slider"),e.$slideTrack=0===e.slideCount?i('<div class="slick-track"/>').appendTo(e.$slider):e.$slides.wrapAll('<div class="slick-track"/>').parent(),e.$list=e.$slideTrack.wrap('<div class="slick-list"/>').parent(),e.$slideTrack.css("opacity",0),e.options.centerMode!==!0&&e.options.swipeToSlide!==!0||(e.options.slidesToScroll=1),i("img[data-lazy]",e.$slider).not("[src]").addClass("slick-loading"),e.setupInfinite(),e.buildArrows(),e.buildDots(),e.updateDots(),e.setSlideClasses("number"==typeof e.currentSlide?e.currentSlide:0),e.options.draggable===!0&&e.$list.addClass("draggable")},e.prototype.buildRows=function(){var i,e,t,o,s,n,r,l=this;if(o=document.createDocumentFragment(),n=l.$slider.children(),l.options.rows>0){for(r=l.options.slidesPerRow*l.options.rows,s=Math.ceil(n.length/r),i=0;i<s;i++){var d=document.createElement("div");for(e=0;e<l.options.rows;e++){var a=document.createElement("div");for(t=0;t<l.options.slidesPerRow;t++){var c=i*r+(e*l.options.slidesPerRow+t);n.get(c)&&a.appendChild(n.get(c))}d.appendChild(a)}o.appendChild(d)}l.$slider.empty().append(o),l.$slider.children().children().children().css({width:100/l.options.slidesPerRow+"%",display:"inline-block"})}},e.prototype.checkResponsive=function(e,t){var o,s,n,r=this,l=!1,d=r.$slider.width(),a=window.innerWidth||i(window).width();if("window"===r.respondTo?n=a:"slider"===r.respondTo?n=d:"min"===r.respondTo&&(n=Math.min(a,d)),r.options.responsive&&r.options.responsive.length&&null!==r.options.responsive){s=null;for(o in r.breakpoints)r.breakpoints.hasOwnProperty(o)&&(r.originalSettings.mobileFirst===!1?n<r.breakpoints[o]&&(s=r.breakpoints[o]):n>r.breakpoints[o]&&(s=r.breakpoints[o]));null!==s?null!==r.activeBreakpoint?(s!==r.activeBreakpoint||t)&&(r.activeBreakpoint=s,"unslick"===r.breakpointSettings[s]?r.unslick(s):(r.options=i.extend({},r.originalSettings,r.breakpointSettings[s]),e===!0&&(r.currentSlide=r.options.initialSlide),r.refresh(e)),l=s):(r.activeBreakpoint=s,"unslick"===r.breakpointSettings[s]?r.unslick(s):(r.options=i.extend({},r.originalSettings,r.breakpointSettings[s]),e===!0&&(r.currentSlide=r.options.initialSlide),r.refresh(e)),l=s):null!==r.activeBreakpoint&&(r.activeBreakpoint=null,r.options=r.originalSettings,e===!0&&(r.currentSlide=r.options.initialSlide),r.refresh(e),l=s),e||l===!1||r.$slider.trigger("breakpoint",[r,l])}},e.prototype.changeSlide=function(e,t){var o,s,n,r=this,l=i(e.currentTarget);switch(l.is("a")&&e.preventDefault(),l.is("li")||(l=l.closest("li")),n=r.slideCount%r.options.slidesToScroll!==0,o=n?0:(r.slideCount-r.currentSlide)%r.options.slidesToScroll,e.data.message){case"previous":s=0===o?r.options.slidesToScroll:r.options.slidesToShow-o,r.slideCount>r.options.slidesToShow&&r.slideHandler(r.currentSlide-s,!1,t);break;case"next":s=0===o?r.options.slidesToScroll:o,r.slideCount>r.options.slidesToShow&&r.slideHandler(r.currentSlide+s,!1,t);break;case"index":var d=0===e.data.index?0:e.data.index||l.index()*r.options.slidesToScroll;r.slideHandler(r.checkNavigable(d),!1,t),l.children().trigger("focus");break;default:return}},e.prototype.checkNavigable=function(i){var e,t,o=this;if(e=o.getNavigableIndexes(),t=0,i>e[e.length-1])i=e[e.length-1];else for(var s in e){if(i<e[s]){i=t;break}t=e[s]}return i},e.prototype.cleanUpEvents=function(){var e=this;e.options.dots&&null!==e.$dots&&(i("li",e.$dots).off("click.slick",e.changeSlide).off("mouseenter.slick",i.proxy(e.interrupt,e,!0)).off("mouseleave.slick",i.proxy(e.interrupt,e,!1)),e.options.accessibility===!0&&e.$dots.off("keydown.slick",e.keyHandler)),e.$slider.off("focus.slick blur.slick"),e.options.arrows===!0&&e.slideCount>e.options.slidesToShow&&(e.$prevArrow&&e.$prevArrow.off("click.slick",e.changeSlide),e.$nextArrow&&e.$nextArrow.off("click.slick",e.changeSlide),e.options.accessibility===!0&&(e.$prevArrow&&e.$prevArrow.off("keydown.slick",e.keyHandler),e.$nextArrow&&e.$nextArrow.off("keydown.slick",e.keyHandler))),e.$list.off("touchstart.slick mousedown.slick",e.swipeHandler),e.$list.off("touchmove.slick mousemove.slick",e.swipeHandler),e.$list.off("touchend.slick mouseup.slick",e.swipeHandler),e.$list.off("touchcancel.slick mouseleave.slick",e.swipeHandler),e.$list.off("click.slick",e.clickHandler),i(document).off(e.visibilityChange,e.visibility),e.cleanUpSlideEvents(),e.options.accessibility===!0&&e.$list.off("keydown.slick",e.keyHandler),e.options.focusOnSelect===!0&&i(e.$slideTrack).children().off("click.slick",e.selectHandler),i(window).off("orientationchange.slick.slick-"+e.instanceUid,e.orientationChange),i(window).off("resize.slick.slick-"+e.instanceUid,e.resize),i("[draggable!=true]",e.$slideTrack).off("dragstart",e.preventDefault),i(window).off("load.slick.slick-"+e.instanceUid,e.setPosition)},e.prototype.cleanUpSlideEvents=function(){var e=this;e.$list.off("mouseenter.slick",i.proxy(e.interrupt,e,!0)),e.$list.off("mouseleave.slick",i.proxy(e.interrupt,e,!1))},e.prototype.cleanUpRows=function(){var i,e=this;e.options.rows>0&&(i=e.$slides.children().children(),i.removeAttr("style"),e.$slider.empty().append(i))},e.prototype.clickHandler=function(i){var e=this;e.shouldClick===!1&&(i.stopImmediatePropagation(),i.stopPropagation(),i.preventDefault())},e.prototype.destroy=function(e){var t=this;t.autoPlayClear(),t.touchObject={},t.cleanUpEvents(),i(".slick-cloned",t.$slider).detach(),t.$dots&&t.$dots.remove(),t.$prevArrow&&t.$prevArrow.length&&(t.$prevArrow.removeClass("slick-disabled slick-arrow slick-hidden").removeAttr("aria-hidden aria-disabled tabindex").css("display",""),t.htmlExpr.test(t.options.prevArrow)&&t.$prevArrow.remove()),t.$nextArrow&&t.$nextArrow.length&&(t.$nextArrow.removeClass("slick-disabled slick-arrow slick-hidden").removeAttr("aria-hidden aria-disabled tabindex").css("display",""),t.htmlExpr.test(t.options.nextArrow)&&t.$nextArrow.remove()),t.$slides&&(t.$slides.removeClass("slick-slide slick-active slick-center slick-visible slick-current").removeAttr("aria-hidden").removeAttr("data-slick-index").each(function(){i(this).attr("style",i(this).data("originalStyling"))}),t.$slideTrack.children(this.options.slide).detach(),t.$slideTrack.detach(),t.$list.detach(),t.$slider.append(t.$slides)),t.cleanUpRows(),t.$slider.removeClass("slick-slider"),t.$slider.removeClass("slick-initialized"),t.$slider.removeClass("slick-dotted"),t.unslicked=!0,e||t.$slider.trigger("destroy",[t])},e.prototype.disableTransition=function(i){var e=this,t={};t[e.transitionType]="",e.options.fade===!1?e.$slideTrack.css(t):e.$slides.eq(i).css(t)},e.prototype.fadeSlide=function(i,e){var t=this;t.cssTransitions===!1?(t.$slides.eq(i).css({zIndex:t.options.zIndex}),t.$slides.eq(i).animate({opacity:1},t.options.speed,t.options.easing,e)):(t.applyTransition(i),t.$slides.eq(i).css({opacity:1,zIndex:t.options.zIndex}),e&&setTimeout(function(){t.disableTransition(i),e.call()},t.options.speed))},e.prototype.fadeSlideOut=function(i){var e=this;e.cssTransitions===!1?e.$slides.eq(i).animate({opacity:0,zIndex:e.options.zIndex-2},e.options.speed,e.options.easing):(e.applyTransition(i),e.$slides.eq(i).css({opacity:0,zIndex:e.options.zIndex-2}))},e.prototype.filterSlides=e.prototype.slickFilter=function(i){var e=this;null!==i&&(e.$slidesCache=e.$slides,e.unload(),e.$slideTrack.children(this.options.slide).detach(),e.$slidesCache.filter(i).appendTo(e.$slideTrack),e.reinit())},e.prototype.focusHandler=function(){var e=this;e.$slider.off("focus.slick blur.slick").on("focus.slick","*",function(t){var o=i(this);setTimeout(function(){e.options.pauseOnFocus&&o.is(":focus")&&(e.focussed=!0,e.autoPlay())},0)}).on("blur.slick","*",function(t){i(this);e.options.pauseOnFocus&&(e.focussed=!1,e.autoPlay())})},e.prototype.getCurrent=e.prototype.slickCurrentSlide=function(){var i=this;return i.currentSlide},e.prototype.getDotCount=function(){var i=this,e=0,t=0,o=0;if(i.options.infinite===!0)if(i.slideCount<=i.options.slidesToShow)++o;else for(;e<i.slideCount;)++o,e=t+i.options.slidesToScroll,t+=i.options.slidesToScroll<=i.options.slidesToShow?i.options.slidesToScroll:i.options.slidesToShow;else if(i.options.centerMode===!0)o=i.slideCount;else if(i.options.asNavFor)for(;e<i.slideCount;)++o,e=t+i.options.slidesToScroll,t+=i.options.slidesToScroll<=i.options.slidesToShow?i.options.slidesToScroll:i.options.slidesToShow;else o=1+Math.ceil((i.slideCount-i.options.slidesToShow)/i.options.slidesToScroll);return o-1},e.prototype.getLeft=function(i){var e,t,o,s,n=this,r=0;return n.slideOffset=0,t=n.$slides.first().outerHeight(!0),n.options.infinite===!0?(n.slideCount>n.options.slidesToShow&&(n.slideOffset=n.slideWidth*n.options.slidesToShow*-1,s=-1,n.options.vertical===!0&&n.options.centerMode===!0&&(2===n.options.slidesToShow?s=-1.5:1===n.options.slidesToShow&&(s=-2)),r=t*n.options.slidesToShow*s),n.slideCount%n.options.slidesToScroll!==0&&i+n.options.slidesToScroll>n.slideCount&&n.slideCount>n.options.slidesToShow&&(i>n.slideCount?(n.slideOffset=(n.options.slidesToShow-(i-n.slideCount))*n.slideWidth*-1,r=(n.options.slidesToShow-(i-n.slideCount))*t*-1):(n.slideOffset=n.slideCount%n.options.slidesToScroll*n.slideWidth*-1,r=n.slideCount%n.options.slidesToScroll*t*-1))):i+n.options.slidesToShow>n.slideCount&&(n.slideOffset=(i+n.options.slidesToShow-n.slideCount)*n.slideWidth,r=(i+n.options.slidesToShow-n.slideCount)*t),n.slideCount<=n.options.slidesToShow&&(n.slideOffset=0,r=0),n.options.centerMode===!0&&n.slideCount<=n.options.slidesToShow?n.slideOffset=n.slideWidth*Math.floor(n.options.slidesToShow)/2-n.slideWidth*n.slideCount/2:n.options.centerMode===!0&&n.options.infinite===!0?n.slideOffset+=n.slideWidth*Math.floor(n.options.slidesToShow/2)-n.slideWidth:n.options.centerMode===!0&&(n.slideOffset=0,n.slideOffset+=n.slideWidth*Math.floor(n.options.slidesToShow/2)),e=n.options.vertical===!1?i*n.slideWidth*-1+n.slideOffset:i*t*-1+r,n.options.variableWidth===!0&&(o=n.slideCount<=n.options.slidesToShow||n.options.infinite===!1?n.$slideTrack.children(".slick-slide").eq(i):n.$slideTrack.children(".slick-slide").eq(i+n.options.slidesToShow),e=n.options.rtl===!0?o[0]?(n.$slideTrack.width()-o[0].offsetLeft-o.width())*-1:0:o[0]?o[0].offsetLeft*-1:0,n.options.centerMode===!0&&(o=n.slideCount<=n.options.slidesToShow||n.options.infinite===!1?n.$slideTrack.children(".slick-slide").eq(i):n.$slideTrack.children(".slick-slide").eq(i+n.options.slidesToShow+1),e=n.options.rtl===!0?o[0]?(n.$slideTrack.width()-o[0].offsetLeft-o.width())*-1:0:o[0]?o[0].offsetLeft*-1:0,e+=(n.$list.width()-o.outerWidth())/2)),e},e.prototype.getOption=e.prototype.slickGetOption=function(i){var e=this;return e.options[i]},e.prototype.getNavigableIndexes=function(){var i,e=this,t=0,o=0,s=[];for(e.options.infinite===!1?i=e.slideCount:(t=e.options.slidesToScroll*-1,o=e.options.slidesToScroll*-1,i=2*e.slideCount);t<i;)s.push(t),t=o+e.options.slidesToScroll,o+=e.options.slidesToScroll<=e.options.slidesToShow?e.options.slidesToScroll:e.options.slidesToShow;return s},e.prototype.getSlick=function(){return this},e.prototype.getSlideCount=function(){var e,t,o,s,n=this;return s=n.options.centerMode===!0?Math.floor(n.$list.width()/2):0,o=n.swipeLeft*-1+s,n.options.swipeToSlide===!0?(n.$slideTrack.find(".slick-slide").each(function(e,s){var r,l,d;if(r=i(s).outerWidth(),l=s.offsetLeft,n.options.centerMode!==!0&&(l+=r/2),d=l+r,o<d)return t=s,!1}),e=Math.abs(i(t).attr("data-slick-index")-n.currentSlide)||1):n.options.slidesToScroll},e.prototype.goTo=e.prototype.slickGoTo=function(i,e){var t=this;t.changeSlide({data:{message:"index",index:parseInt(i)}},e)},e.prototype.init=function(e){var t=this;i(t.$slider).hasClass("slick-initialized")||(i(t.$slider).addClass("slick-initialized"),t.buildRows(),t.buildOut(),t.setProps(),t.startLoad(),t.loadSlider(),t.initializeEvents(),t.updateArrows(),t.updateDots(),t.checkResponsive(!0),t.focusHandler()),e&&t.$slider.trigger("init",[t]),t.options.accessibility===!0&&t.initADA(),t.options.autoplay&&(t.paused=!1,t.autoPlay())},e.prototype.initADA=function(){var e=this,t=Math.ceil(e.slideCount/e.options.slidesToShow),o=e.getNavigableIndexes().filter(function(i){return i>=0&&i<e.slideCount});e.$slides.add(e.$slideTrack.find(".slick-cloned")).attr({"aria-hidden":"true",tabindex:"-1"}).find("a, input, button, select").attr({tabindex:"-1"}),null!==e.$dots&&(e.$slides.not(e.$slideTrack.find(".slick-cloned")).each(function(t){var s=o.indexOf(t);if(i(this).attr({role:"tabpanel",id:"slick-slide"+e.instanceUid+t,tabindex:-1}),s!==-1){var n="slick-slide-control"+e.instanceUid+s;i("#"+n).length&&i(this).attr({"aria-describedby":n})}}),e.$dots.attr("role","tablist").find("li").each(function(s){var n=o[s];i(this).attr({role:"presentation"}),i(this).find("button").first().attr({role:"tab",id:"slick-slide-control"+e.instanceUid+s,"aria-controls":"slick-slide"+e.instanceUid+n,"aria-label":s+1+" of "+t,"aria-selected":null,tabindex:"-1"})}).eq(e.currentSlide).find("button").attr({"aria-selected":"true",tabindex:"0"}).end());for(var s=e.currentSlide,n=s+e.options.slidesToShow;s<n;s++)e.options.focusOnChange?e.$slides.eq(s).attr({tabindex:"0"}):e.$slides.eq(s).removeAttr("tabindex");e.activateADA()},e.prototype.initArrowEvents=function(){var i=this;i.options.arrows===!0&&i.slideCount>i.options.slidesToShow&&(i.$prevArrow.off("click.slick").on("click.slick",{message:"previous"},i.changeSlide),i.$nextArrow.off("click.slick").on("click.slick",{message:"next"},i.changeSlide),i.options.accessibility===!0&&(i.$prevArrow.on("keydown.slick",i.keyHandler),i.$nextArrow.on("keydown.slick",i.keyHandler)))},e.prototype.initDotEvents=function(){var e=this;e.options.dots===!0&&e.slideCount>e.options.slidesToShow&&(i("li",e.$dots).on("click.slick",{message:"index"},e.changeSlide),e.options.accessibility===!0&&e.$dots.on("keydown.slick",e.keyHandler)),e.options.dots===!0&&e.options.pauseOnDotsHover===!0&&e.slideCount>e.options.slidesToShow&&i("li",e.$dots).on("mouseenter.slick",i.proxy(e.interrupt,e,!0)).on("mouseleave.slick",i.proxy(e.interrupt,e,!1))},e.prototype.initSlideEvents=function(){var e=this;e.options.pauseOnHover&&(e.$list.on("mouseenter.slick",i.proxy(e.interrupt,e,!0)),e.$list.on("mouseleave.slick",i.proxy(e.interrupt,e,!1)))},e.prototype.initializeEvents=function(){var e=this;e.initArrowEvents(),e.initDotEvents(),e.initSlideEvents(),e.$list.on("touchstart.slick mousedown.slick",{action:"start"},e.swipeHandler),e.$list.on("touchmove.slick mousemove.slick",{action:"move"},e.swipeHandler),e.$list.on("touchend.slick mouseup.slick",{action:"end"},e.swipeHandler),e.$list.on("touchcancel.slick mouseleave.slick",{action:"end"},e.swipeHandler),e.$list.on("click.slick",e.clickHandler),i(document).on(e.visibilityChange,i.proxy(e.visibility,e)),e.options.accessibility===!0&&e.$list.on("keydown.slick",e.keyHandler),e.options.focusOnSelect===!0&&i(e.$slideTrack).children().on("click.slick",e.selectHandler),i(window).on("orientationchange.slick.slick-"+e.instanceUid,i.proxy(e.orientationChange,e)),i(window).on("resize.slick.slick-"+e.instanceUid,i.proxy(e.resize,e)),i("[draggable!=true]",e.$slideTrack).on("dragstart",e.preventDefault),i(window).on("load.slick.slick-"+e.instanceUid,e.setPosition),i(e.setPosition)},e.prototype.initUI=function(){var i=this;i.options.arrows===!0&&i.slideCount>i.options.slidesToShow&&(i.$prevArrow.show(),i.$nextArrow.show()),i.options.dots===!0&&i.slideCount>i.options.slidesToShow&&i.$dots.show()},e.prototype.keyHandler=function(i){var e=this;i.target.tagName.match("TEXTAREA|INPUT|SELECT")||(37===i.keyCode&&e.options.accessibility===!0?e.changeSlide({data:{message:e.options.rtl===!0?"next":"previous"}}):39===i.keyCode&&e.options.accessibility===!0&&e.changeSlide({data:{message:e.options.rtl===!0?"previous":"next"}}))},e.prototype.lazyLoad=function(){function e(e){i("img[data-lazy]",e).each(function(){var e=i(this),t=i(this).attr("data-lazy"),o=i(this).attr("data-srcset"),s=i(this).attr("data-sizes")||r.$slider.attr("data-sizes"),n=document.createElement("img");n.onload=function(){e.animate({opacity:0},100,function(){o&&(e.attr("srcset",o),s&&e.attr("sizes",s)),e.attr("src",t).animate({opacity:1},200,function(){e.removeAttr("data-lazy data-srcset data-sizes").removeClass("slick-loading")}),r.$slider.trigger("lazyLoaded",[r,e,t])})},n.onerror=function(){e.removeAttr("data-lazy").removeClass("slick-loading").addClass("slick-lazyload-error"),r.$slider.trigger("lazyLoadError",[r,e,t])},n.src=t})}var t,o,s,n,r=this;if(r.options.centerMode===!0?r.options.infinite===!0?(s=r.currentSlide+(r.options.slidesToShow/2+1),n=s+r.options.slidesToShow+2):(s=Math.max(0,r.currentSlide-(r.options.slidesToShow/2+1)),n=2+(r.options.slidesToShow/2+1)+r.currentSlide):(s=r.options.infinite?r.options.slidesToShow+r.currentSlide:r.currentSlide,n=Math.ceil(s+r.options.slidesToShow),r.options.fade===!0&&(s>0&&s--,n<=r.slideCount&&n++)),t=r.$slider.find(".slick-slide").slice(s,n),"anticipated"===r.options.lazyLoad)for(var l=s-1,d=n,a=r.$slider.find(".slick-slide"),c=0;c<r.options.slidesToScroll;c++)l<0&&(l=r.slideCount-1),t=t.add(a.eq(l)),t=t.add(a.eq(d)),l--,d++;e(t),r.slideCount<=r.options.slidesToShow?(o=r.$slider.find(".slick-slide"),e(o)):r.currentSlide>=r.slideCount-r.options.slidesToShow?(o=r.$slider.find(".slick-cloned").slice(0,r.options.slidesToShow),e(o)):0===r.currentSlide&&(o=r.$slider.find(".slick-cloned").slice(r.options.slidesToShow*-1),e(o))},e.prototype.loadSlider=function(){var i=this;i.setPosition(),i.$slideTrack.css({opacity:1}),i.$slider.removeClass("slick-loading"),i.initUI(),"progressive"===i.options.lazyLoad&&i.progressiveLazyLoad()},e.prototype.next=e.prototype.slickNext=function(){var i=this;i.changeSlide({data:{message:"next"}})},e.prototype.orientationChange=function(){var i=this;i.checkResponsive(),i.setPosition()},e.prototype.pause=e.prototype.slickPause=function(){var i=this;i.autoPlayClear(),i.paused=!0},e.prototype.play=e.prototype.slickPlay=function(){var i=this;i.autoPlay(),i.options.autoplay=!0,i.paused=!1,i.focussed=!1,i.interrupted=!1},e.prototype.postSlide=function(e){var t=this;if(!t.unslicked&&(t.$slider.trigger("afterChange",[t,e]),t.animating=!1,t.slideCount>t.options.slidesToShow&&t.setPosition(),t.swipeLeft=null,t.options.autoplay&&t.autoPlay(),t.options.accessibility===!0&&(t.initADA(),t.options.focusOnChange))){var o=i(t.$slides.get(t.currentSlide));o.attr("tabindex",0).focus()}},e.prototype.prev=e.prototype.slickPrev=function(){var i=this;i.changeSlide({data:{message:"previous"}})},e.prototype.preventDefault=function(i){i.preventDefault()},e.prototype.progressiveLazyLoad=function(e){e=e||1;var t,o,s,n,r,l=this,d=i("img[data-lazy]",l.$slider);d.length?(t=d.first(),o=t.attr("data-lazy"),s=t.attr("data-srcset"),n=t.attr("data-sizes")||l.$slider.attr("data-sizes"),r=document.createElement("img"),r.onload=function(){s&&(t.attr("srcset",s),n&&t.attr("sizes",n)),t.attr("src",o).removeAttr("data-lazy data-srcset data-sizes").removeClass("slick-loading"),l.options.adaptiveHeight===!0&&l.setPosition(),l.$slider.trigger("lazyLoaded",[l,t,o]),l.progressiveLazyLoad()},r.onerror=function(){e<3?setTimeout(function(){l.progressiveLazyLoad(e+1)},500):(t.removeAttr("data-lazy").removeClass("slick-loading").addClass("slick-lazyload-error"),l.$slider.trigger("lazyLoadError",[l,t,o]),l.progressiveLazyLoad())},r.src=o):l.$slider.trigger("allImagesLoaded",[l])},e.prototype.refresh=function(e){var t,o,s=this;o=s.slideCount-s.options.slidesToShow,!s.options.infinite&&s.currentSlide>o&&(s.currentSlide=o),s.slideCount<=s.options.slidesToShow&&(s.currentSlide=0),t=s.currentSlide,s.destroy(!0),i.extend(s,s.initials,{currentSlide:t}),s.init(),e||s.changeSlide({data:{message:"index",index:t}},!1)},e.prototype.registerBreakpoints=function(){var e,t,o,s=this,n=s.options.responsive||null;if("array"===i.type(n)&&n.length){s.respondTo=s.options.respondTo||"window";for(e in n)if(o=s.breakpoints.length-1,n.hasOwnProperty(e)){for(t=n[e].breakpoint;o>=0;)s.breakpoints[o]&&s.breakpoints[o]===t&&s.breakpoints.splice(o,1),o--;s.breakpoints.push(t),s.breakpointSettings[t]=n[e].settings}s.breakpoints.sort(function(i,e){return s.options.mobileFirst?i-e:e-i})}},e.prototype.reinit=function(){var e=this;e.$slides=e.$slideTrack.children(e.options.slide).addClass("slick-slide"),e.slideCount=e.$slides.length,e.currentSlide>=e.slideCount&&0!==e.currentSlide&&(e.currentSlide=e.currentSlide-e.options.slidesToScroll),e.slideCount<=e.options.slidesToShow&&(e.currentSlide=0),e.registerBreakpoints(),e.setProps(),e.setupInfinite(),e.buildArrows(),e.updateArrows(),e.initArrowEvents(),e.buildDots(),e.updateDots(),e.initDotEvents(),e.cleanUpSlideEvents(),e.initSlideEvents(),e.checkResponsive(!1,!0),e.options.focusOnSelect===!0&&i(e.$slideTrack).children().on("click.slick",e.selectHandler),e.setSlideClasses("number"==typeof e.currentSlide?e.currentSlide:0),e.setPosition(),e.focusHandler(),e.paused=!e.options.autoplay,e.autoPlay(),e.$slider.trigger("reInit",[e])},e.prototype.resize=function(){var e=this;i(window).width()!==e.windowWidth&&(clearTimeout(e.windowDelay),e.windowDelay=window.setTimeout(function(){e.windowWidth=i(window).width(),e.checkResponsive(),e.unslicked||e.setPosition()},50))},e.prototype.removeSlide=e.prototype.slickRemove=function(i,e,t){var o=this;return"boolean"==typeof i?(e=i,i=e===!0?0:o.slideCount-1):i=e===!0?--i:i,!(o.slideCount<1||i<0||i>o.slideCount-1)&&(o.unload(),t===!0?o.$slideTrack.children().remove():o.$slideTrack.children(this.options.slide).eq(i).remove(),o.$slides=o.$slideTrack.children(this.options.slide),o.$slideTrack.children(this.options.slide).detach(),o.$slideTrack.append(o.$slides),o.$slidesCache=o.$slides,void o.reinit())},e.prototype.setCSS=function(i){var e,t,o=this,s={};o.options.rtl===!0&&(i=-i),e="left"==o.positionProp?Math.ceil(i)+"px":"0px",t="top"==o.positionProp?Math.ceil(i)+"px":"0px",s[o.positionProp]=i,o.transformsEnabled===!1?o.$slideTrack.css(s):(s={},o.cssTransitions===!1?(s[o.animType]="translate("+e+", "+t+")",o.$slideTrack.css(s)):(s[o.animType]="translate3d("+e+", "+t+", 0px)",o.$slideTrack.css(s)))},e.prototype.setDimensions=function(){var i=this;i.options.vertical===!1?i.options.centerMode===!0&&i.$list.css({padding:"0px "+i.options.centerPadding}):(i.$list.height(i.$slides.first().outerHeight(!0)*i.options.slidesToShow),i.options.centerMode===!0&&i.$list.css({padding:i.options.centerPadding+" 0px"})),i.listWidth=i.$list.width(),i.listHeight=i.$list.height(),i.options.vertical===!1&&i.options.variableWidth===!1?(i.slideWidth=Math.ceil(i.listWidth/i.options.slidesToShow),i.$slideTrack.width(Math.ceil(i.slideWidth*i.$slideTrack.children(".slick-slide").length))):i.options.variableWidth===!0?i.$slideTrack.width(5e3*i.slideCount):(i.slideWidth=Math.ceil(i.listWidth),i.$slideTrack.height(Math.ceil(i.$slides.first().outerHeight(!0)*i.$slideTrack.children(".slick-slide").length)));var e=i.$slides.first().outerWidth(!0)-i.$slides.first().width();i.options.variableWidth===!1&&i.$slideTrack.children(".slick-slide").width(i.slideWidth-e)},e.prototype.setFade=function(){var e,t=this;t.$slides.each(function(o,s){e=t.slideWidth*o*-1,t.options.rtl===!0?i(s).css({position:"relative",right:e,top:0,zIndex:t.options.zIndex-2,opacity:0}):i(s).css({position:"relative",left:e,top:0,zIndex:t.options.zIndex-2,opacity:0})}),t.$slides.eq(t.currentSlide).css({zIndex:t.options.zIndex-1,opacity:1})},e.prototype.setHeight=function(){var i=this;if(1===i.options.slidesToShow&&i.options.adaptiveHeight===!0&&i.options.vertical===!1){var e=i.$slides.eq(i.currentSlide).outerHeight(!0);i.$list.css("height",e)}},e.prototype.setOption=e.prototype.slickSetOption=function(){var e,t,o,s,n,r=this,l=!1;if("object"===i.type(arguments[0])?(o=arguments[0],l=arguments[1],n="multiple"):"string"===i.type(arguments[0])&&(o=arguments[0],s=arguments[1],l=arguments[2],"responsive"===arguments[0]&&"array"===i.type(arguments[1])?n="responsive":"undefined"!=typeof arguments[1]&&(n="single")),"single"===n)r.options[o]=s;else if("multiple"===n)i.each(o,function(i,e){r.options[i]=e});else if("responsive"===n)for(t in s)if("array"!==i.type(r.options.responsive))r.options.responsive=[s[t]];else{for(e=r.options.responsive.length-1;e>=0;)r.options.responsive[e].breakpoint===s[t].breakpoint&&r.options.responsive.splice(e,1),e--;r.options.responsive.push(s[t])}l&&(r.unload(),r.reinit())},e.prototype.setPosition=function(){var i=this;i.setDimensions(),i.setHeight(),i.options.fade===!1?i.setCSS(i.getLeft(i.currentSlide)):i.setFade(),i.$slider.trigger("setPosition",[i])},e.prototype.setProps=function(){var i=this,e=document.body.style;i.positionProp=i.options.vertical===!0?"top":"left",
"top"===i.positionProp?i.$slider.addClass("slick-vertical"):i.$slider.removeClass("slick-vertical"),void 0===e.WebkitTransition&&void 0===e.MozTransition&&void 0===e.msTransition||i.options.useCSS===!0&&(i.cssTransitions=!0),i.options.fade&&("number"==typeof i.options.zIndex?i.options.zIndex<3&&(i.options.zIndex=3):i.options.zIndex=i.defaults.zIndex),void 0!==e.OTransform&&(i.animType="OTransform",i.transformType="-o-transform",i.transitionType="OTransition",void 0===e.perspectiveProperty&&void 0===e.webkitPerspective&&(i.animType=!1)),void 0!==e.MozTransform&&(i.animType="MozTransform",i.transformType="-moz-transform",i.transitionType="MozTransition",void 0===e.perspectiveProperty&&void 0===e.MozPerspective&&(i.animType=!1)),void 0!==e.webkitTransform&&(i.animType="webkitTransform",i.transformType="-webkit-transform",i.transitionType="webkitTransition",void 0===e.perspectiveProperty&&void 0===e.webkitPerspective&&(i.animType=!1)),void 0!==e.msTransform&&(i.animType="msTransform",i.transformType="-ms-transform",i.transitionType="msTransition",void 0===e.msTransform&&(i.animType=!1)),void 0!==e.transform&&i.animType!==!1&&(i.animType="transform",i.transformType="transform",i.transitionType="transition"),i.transformsEnabled=i.options.useTransform&&null!==i.animType&&i.animType!==!1},e.prototype.setSlideClasses=function(i){var e,t,o,s,n=this;if(t=n.$slider.find(".slick-slide").removeClass("slick-active slick-center slick-current").attr("aria-hidden","true"),n.$slides.eq(i).addClass("slick-current"),n.options.centerMode===!0){var r=n.options.slidesToShow%2===0?1:0;e=Math.floor(n.options.slidesToShow/2),n.options.infinite===!0&&(i>=e&&i<=n.slideCount-1-e?n.$slides.slice(i-e+r,i+e+1).addClass("slick-active").attr("aria-hidden","false"):(o=n.options.slidesToShow+i,t.slice(o-e+1+r,o+e+2).addClass("slick-active").attr("aria-hidden","false")),0===i?t.eq(t.length-1-n.options.slidesToShow).addClass("slick-center"):i===n.slideCount-1&&t.eq(n.options.slidesToShow).addClass("slick-center")),n.$slides.eq(i).addClass("slick-center")}else i>=0&&i<=n.slideCount-n.options.slidesToShow?n.$slides.slice(i,i+n.options.slidesToShow).addClass("slick-active").attr("aria-hidden","false"):t.length<=n.options.slidesToShow?t.addClass("slick-active").attr("aria-hidden","false"):(s=n.slideCount%n.options.slidesToShow,o=n.options.infinite===!0?n.options.slidesToShow+i:i,n.options.slidesToShow==n.options.slidesToScroll&&n.slideCount-i<n.options.slidesToShow?t.slice(o-(n.options.slidesToShow-s),o+s).addClass("slick-active").attr("aria-hidden","false"):t.slice(o,o+n.options.slidesToShow).addClass("slick-active").attr("aria-hidden","false"));"ondemand"!==n.options.lazyLoad&&"anticipated"!==n.options.lazyLoad||n.lazyLoad()},e.prototype.setupInfinite=function(){var e,t,o,s=this;if(s.options.fade===!0&&(s.options.centerMode=!1),s.options.infinite===!0&&s.options.fade===!1&&(t=null,s.slideCount>s.options.slidesToShow)){for(o=s.options.centerMode===!0?s.options.slidesToShow+1:s.options.slidesToShow,e=s.slideCount;e>s.slideCount-o;e-=1)t=e-1,i(s.$slides[t]).clone(!0).attr("id","").attr("data-slick-index",t-s.slideCount).prependTo(s.$slideTrack).addClass("slick-cloned");for(e=0;e<o+s.slideCount;e+=1)t=e,i(s.$slides[t]).clone(!0).attr("id","").attr("data-slick-index",t+s.slideCount).appendTo(s.$slideTrack).addClass("slick-cloned");s.$slideTrack.find(".slick-cloned").find("[id]").each(function(){i(this).attr("id","")})}},e.prototype.interrupt=function(i){var e=this;i||e.autoPlay(),e.interrupted=i},e.prototype.selectHandler=function(e){var t=this,o=i(e.target).is(".slick-slide")?i(e.target):i(e.target).parents(".slick-slide"),s=parseInt(o.attr("data-slick-index"));return s||(s=0),t.slideCount<=t.options.slidesToShow?void t.slideHandler(s,!1,!0):void t.slideHandler(s)},e.prototype.slideHandler=function(i,e,t){var o,s,n,r,l,d=null,a=this;if(e=e||!1,!(a.animating===!0&&a.options.waitForAnimate===!0||a.options.fade===!0&&a.currentSlide===i))return e===!1&&a.asNavFor(i),o=i,d=a.getLeft(o),r=a.getLeft(a.currentSlide),a.currentLeft=null===a.swipeLeft?r:a.swipeLeft,a.options.infinite===!1&&a.options.centerMode===!1&&(i<0||i>a.getDotCount()*a.options.slidesToScroll)?void(a.options.fade===!1&&(o=a.currentSlide,t!==!0&&a.slideCount>a.options.slidesToShow?a.animateSlide(r,function(){a.postSlide(o)}):a.postSlide(o))):a.options.infinite===!1&&a.options.centerMode===!0&&(i<0||i>a.slideCount-a.options.slidesToScroll)?void(a.options.fade===!1&&(o=a.currentSlide,t!==!0&&a.slideCount>a.options.slidesToShow?a.animateSlide(r,function(){a.postSlide(o)}):a.postSlide(o))):(a.options.autoplay&&clearInterval(a.autoPlayTimer),s=o<0?a.slideCount%a.options.slidesToScroll!==0?a.slideCount-a.slideCount%a.options.slidesToScroll:a.slideCount+o:o>=a.slideCount?a.slideCount%a.options.slidesToScroll!==0?0:o-a.slideCount:o,a.animating=!0,a.$slider.trigger("beforeChange",[a,a.currentSlide,s]),n=a.currentSlide,a.currentSlide=s,a.setSlideClasses(a.currentSlide),a.options.asNavFor&&(l=a.getNavTarget(),l=l.slick("getSlick"),l.slideCount<=l.options.slidesToShow&&l.setSlideClasses(a.currentSlide)),a.updateDots(),a.updateArrows(),a.options.fade===!0?(t!==!0?(a.fadeSlideOut(n),a.fadeSlide(s,function(){a.postSlide(s)})):a.postSlide(s),void a.animateHeight()):void(t!==!0&&a.slideCount>a.options.slidesToShow?a.animateSlide(d,function(){a.postSlide(s)}):a.postSlide(s)))},e.prototype.startLoad=function(){var i=this;i.options.arrows===!0&&i.slideCount>i.options.slidesToShow&&(i.$prevArrow.hide(),i.$nextArrow.hide()),i.options.dots===!0&&i.slideCount>i.options.slidesToShow&&i.$dots.hide(),i.$slider.addClass("slick-loading")},e.prototype.swipeDirection=function(){var i,e,t,o,s=this;return i=s.touchObject.startX-s.touchObject.curX,e=s.touchObject.startY-s.touchObject.curY,t=Math.atan2(e,i),o=Math.round(180*t/Math.PI),o<0&&(o=360-Math.abs(o)),o<=45&&o>=0?s.options.rtl===!1?"left":"right":o<=360&&o>=315?s.options.rtl===!1?"left":"right":o>=135&&o<=225?s.options.rtl===!1?"right":"left":s.options.verticalSwiping===!0?o>=35&&o<=135?"down":"up":"vertical"},e.prototype.swipeEnd=function(i){var e,t,o=this;if(o.dragging=!1,o.swiping=!1,o.scrolling)return o.scrolling=!1,!1;if(o.interrupted=!1,o.shouldClick=!(o.touchObject.swipeLength>10),void 0===o.touchObject.curX)return!1;if(o.touchObject.edgeHit===!0&&o.$slider.trigger("edge",[o,o.swipeDirection()]),o.touchObject.swipeLength>=o.touchObject.minSwipe){switch(t=o.swipeDirection()){case"left":case"down":e=o.options.swipeToSlide?o.checkNavigable(o.currentSlide+o.getSlideCount()):o.currentSlide+o.getSlideCount(),o.currentDirection=0;break;case"right":case"up":e=o.options.swipeToSlide?o.checkNavigable(o.currentSlide-o.getSlideCount()):o.currentSlide-o.getSlideCount(),o.currentDirection=1}"vertical"!=t&&(o.slideHandler(e),o.touchObject={},o.$slider.trigger("swipe",[o,t]))}else o.touchObject.startX!==o.touchObject.curX&&(o.slideHandler(o.currentSlide),o.touchObject={})},e.prototype.swipeHandler=function(i){var e=this;if(!(e.options.swipe===!1||"ontouchend"in document&&e.options.swipe===!1||e.options.draggable===!1&&i.type.indexOf("mouse")!==-1))switch(e.touchObject.fingerCount=i.originalEvent&&void 0!==i.originalEvent.touches?i.originalEvent.touches.length:1,e.touchObject.minSwipe=e.listWidth/e.options.touchThreshold,e.options.verticalSwiping===!0&&(e.touchObject.minSwipe=e.listHeight/e.options.touchThreshold),i.data.action){case"start":e.swipeStart(i);break;case"move":e.swipeMove(i);break;case"end":e.swipeEnd(i)}},e.prototype.swipeMove=function(i){var e,t,o,s,n,r,l=this;return n=void 0!==i.originalEvent?i.originalEvent.touches:null,!(!l.dragging||l.scrolling||n&&1!==n.length)&&(e=l.getLeft(l.currentSlide),l.touchObject.curX=void 0!==n?n[0].pageX:i.clientX,l.touchObject.curY=void 0!==n?n[0].pageY:i.clientY,l.touchObject.swipeLength=Math.round(Math.sqrt(Math.pow(l.touchObject.curX-l.touchObject.startX,2))),r=Math.round(Math.sqrt(Math.pow(l.touchObject.curY-l.touchObject.startY,2))),!l.options.verticalSwiping&&!l.swiping&&r>4?(l.scrolling=!0,!1):(l.options.verticalSwiping===!0&&(l.touchObject.swipeLength=r),t=l.swipeDirection(),void 0!==i.originalEvent&&l.touchObject.swipeLength>4&&(l.swiping=!0,i.preventDefault()),s=(l.options.rtl===!1?1:-1)*(l.touchObject.curX>l.touchObject.startX?1:-1),l.options.verticalSwiping===!0&&(s=l.touchObject.curY>l.touchObject.startY?1:-1),o=l.touchObject.swipeLength,l.touchObject.edgeHit=!1,l.options.infinite===!1&&(0===l.currentSlide&&"right"===t||l.currentSlide>=l.getDotCount()&&"left"===t)&&(o=l.touchObject.swipeLength*l.options.edgeFriction,l.touchObject.edgeHit=!0),l.options.vertical===!1?l.swipeLeft=e+o*s:l.swipeLeft=e+o*(l.$list.height()/l.listWidth)*s,l.options.verticalSwiping===!0&&(l.swipeLeft=e+o*s),l.options.fade!==!0&&l.options.touchMove!==!1&&(l.animating===!0?(l.swipeLeft=null,!1):void l.setCSS(l.swipeLeft))))},e.prototype.swipeStart=function(i){var e,t=this;return t.interrupted=!0,1!==t.touchObject.fingerCount||t.slideCount<=t.options.slidesToShow?(t.touchObject={},!1):(void 0!==i.originalEvent&&void 0!==i.originalEvent.touches&&(e=i.originalEvent.touches[0]),t.touchObject.startX=t.touchObject.curX=void 0!==e?e.pageX:i.clientX,t.touchObject.startY=t.touchObject.curY=void 0!==e?e.pageY:i.clientY,void(t.dragging=!0))},e.prototype.unfilterSlides=e.prototype.slickUnfilter=function(){var i=this;null!==i.$slidesCache&&(i.unload(),i.$slideTrack.children(this.options.slide).detach(),i.$slidesCache.appendTo(i.$slideTrack),i.reinit())},e.prototype.unload=function(){var e=this;i(".slick-cloned",e.$slider).remove(),e.$dots&&e.$dots.remove(),e.$prevArrow&&e.htmlExpr.test(e.options.prevArrow)&&e.$prevArrow.remove(),e.$nextArrow&&e.htmlExpr.test(e.options.nextArrow)&&e.$nextArrow.remove(),e.$slides.removeClass("slick-slide slick-active slick-visible slick-current").attr("aria-hidden","true").css("width","")},e.prototype.unslick=function(i){var e=this;e.$slider.trigger("unslick",[e,i]),e.destroy()},e.prototype.updateArrows=function(){var i,e=this;i=Math.floor(e.options.slidesToShow/2),e.options.arrows===!0&&e.slideCount>e.options.slidesToShow&&!e.options.infinite&&(e.$prevArrow.removeClass("slick-disabled").attr("aria-disabled","false"),e.$nextArrow.removeClass("slick-disabled").attr("aria-disabled","false"),0===e.currentSlide?(e.$prevArrow.addClass("slick-disabled").attr("aria-disabled","true"),e.$nextArrow.removeClass("slick-disabled").attr("aria-disabled","false")):e.currentSlide>=e.slideCount-e.options.slidesToShow&&e.options.centerMode===!1?(e.$nextArrow.addClass("slick-disabled").attr("aria-disabled","true"),e.$prevArrow.removeClass("slick-disabled").attr("aria-disabled","false")):e.currentSlide>=e.slideCount-1&&e.options.centerMode===!0&&(e.$nextArrow.addClass("slick-disabled").attr("aria-disabled","true"),e.$prevArrow.removeClass("slick-disabled").attr("aria-disabled","false")))},e.prototype.updateDots=function(){var i=this;null!==i.$dots&&(i.$dots.find("li").removeClass("slick-active").end(),i.$dots.find("li").eq(Math.floor(i.currentSlide/i.options.slidesToScroll)).addClass("slick-active"))},e.prototype.visibility=function(){var i=this;i.options.autoplay&&(document[i.hidden]?i.interrupted=!0:i.interrupted=!1)},i.fn.slick=function(){var i,t,o=this,s=arguments[0],n=Array.prototype.slice.call(arguments,1),r=o.length;for(i=0;i<r;i++)if("object"==typeof s||"undefined"==typeof s?o[i].slick=new e(o[i],s):t=o[i].slick[s].apply(o[i].slick,n),"undefined"!=typeof t)return t;return o}});
/**!
 * trunk8 v1.3.3
 * https://github.com/rviscomi/trunk8
 * 
 * Copyright 2012 Rick Viscomi
 * Released under the MIT License.
 * 
 * Date: September 26, 2012
 */

!function(t,e){"function"==typeof define&&define.amd?define(["jquery"],e):"object"==typeof module&&module.exports?e(require("jquery")):e(t.jQuery)}(this,function(t){var e,n,r="center",i="left",a="right",s={auto:"auto"};function o(e){this.$element=t(e),this.original_text=t.trim(this.$element.html()),this.settings=t.extend({},t.fn.trunk8.defaults)}function l(t){var e=document.createElement("DIV");return e.innerHTML=t,void 0!==e.textContent?e.textContent:e.innerText}function u(e,n,r){e=e.replace(r,"");var i=function(n,a){var s,o,l,u,h="";for(u=0;u<n.length;u++)s=n[u],l=t.trim(e).split(" ").length,t.trim(e).length&&("string"==typeof s?(/<br\s*\/?>/i.test(s)||(1===l&&t.trim(e).length<=s.length?(s=e,"p"!==a&&"div"!==a||(s+=r),e=""):e=e.replace(s,"")),h+=t.trim(s)+(u===n.length-1||l<=1?"":" ")):(o=i(s.content,s.tag),s.after&&(e=e.replace(s.after,"")),o&&(s.after||(s.after=" "),h+="<"+s.tag+s.attribs+">"+o+"</"+s.tag+">"+s.after)));return h},a=i(n);return a.slice(a.length-r.length)!==r&&(a+=r),a}function h(){var e,r,i,a,o,h,c=this.data("trunk8"),f=c.settings,g=f.width,d=f.side,p=f.fill,m=f.parseHTML,v=n.getLineHeight(this)*f.lines,y=c.original_text,S=y.length,x="";if(this.html(y),o=this.text(),m&&l(y)!==y&&(h=function t(e){if(l(e)===e)return e.split(/\s/g);for(var n,r,i=[],a=/<([a-z]+)([^<]*)(?:>([\S\s]*?(?!<\1>))<\/\1>|\s+\/>)(['.?!,]*)|((?:[^<>\s])+['.?!,]*\w?|<br\s?\/?>)/gi,s=a.exec(e);s&&n!==a.lastIndex;)n=a.lastIndex,s[5]?i.push(s[5]):s[1]&&i.push({tag:s[1],attribs:s[2],content:s[3],after:s[4]}),s=a.exec(e);for(r=0;r<i.length;r++)"string"!=typeof i[r]&&i[r].content&&(i[r].content=t(i[r].content));return i}(y),S=(y=l(y)).length),g===s.auto){if(this.height()<=v)return;for(e=0,r=S-1;e<=r;)i=e+(r-e>>1),a=n.eatStr(y,d,S-i,p),m&&h&&(a=u(a,h,p)),this.html(a),this.height()>v?r=i-1:(e=i+1,x=x.length>a.length?x:a);this.html(""),this.html(x),f.tooltip&&this.attr("title",o)}else{if(isNaN(g))return void t.error('Invalid width "'+g+'".');i=S-g,a=n.eatStr(y,d,i,p),this.html(a),f.tooltip&&this.attr("title",y)}f.onTruncate()}o.prototype.updateSettings=function(e){this.settings=t.extend(this.settings,e)},e={init:function(e){return this.each(function(){var n=t(this),r=n.data("trunk8");r||n.data("trunk8",r=new o(this)),r.updateSettings(e),h.call(n)})},update:function(e){return this.each(function(){var n=t(this);e&&(n.data("trunk8").original_text=e),h.call(n)})},revert:function(){return this.each(function(){var e=t(this).data("trunk8").original_text;t(this).html(e)})},getSettings:function(){return t(this.get(0)).data("trunk8").settings}},(n={eatStr:function(e,s,o,l){var u,h,c=e.length,f=n.eatStr.generateKey.apply(null,arguments);if(n.eatStr.cache[f])return n.eatStr.cache[f];if("string"==typeof e&&0!==c||t.error('Invalid source string "'+e+'".'),o<0||o>c)t.error('Invalid bite size "'+o+'".');else if(0===o)return e;switch("string"!=typeof(l+"")&&t.error("Fill unable to be converted to a string."),s){case a:return n.eatStr.cache[f]=t.trim(e.substr(0,c-o))+l;case i:return n.eatStr.cache[f]=l+t.trim(e.substr(o));case r:return u=c>>1,h=o>>1,n.eatStr.cache[f]=t.trim(n.eatStr(e.substr(0,c-u),a,o-h,""))+l+t.trim(n.eatStr(e.substr(c-u),i,h,""));default:t.error('Invalid side "'+s+'".')}},getLineHeight:function(e){var n=t(e).css("float");"none"!==n&&t(e).css("float","none");var r=t(e).css("position");"absolute"===r&&t(e).css("position","static");var i,a=t(e).html(),s="line-height-test";return t(e).html("i").wrap('<div id="'+s+'" />'),i=t("#"+s).innerHeight(),t(e).html(a).css({float:n,position:r}).unwrap(),i}}).eatStr.cache={},n.eatStr.generateKey=function(){return Array.prototype.join.call(arguments,"")},t.fn.trunk8=function(n){return e[n]?e[n].apply(this,Array.prototype.slice.call(arguments,1)):"object"!=typeof n&&n?void t.error("Method "+n+" does not exist on jQuery.trunk8"):e.init.apply(this,arguments)},t.fn.trunk8.defaults={fill:"&hellip;",lines:1,side:a,tooltip:!0,width:s.auto,parseHTML:!1,onTruncate:function(){}}});
/**!
 * jquery.visible.min.js
 * https://github.com/customd/jquery-visible
 * @license MIT (https://github.com/customd/jquery-visible/blob/master/LICENSE.txt)
 */
!function(t){var i=t(window);t.fn.visible=function(t,e,o){if(!(this.length<1)){var r=this.length>1?this.eq(0):this,n=r.get(0),f=i.width(),h=i.height(),o=o?o:"both",l=e===!0?n.offsetWidth*n.offsetHeight:!0;if("function"==typeof n.getBoundingClientRect){var g=n.getBoundingClientRect(),u=g.top>=0&&g.top<h,s=g.bottom>0&&g.bottom<=h,c=g.left>=0&&g.left<f,a=g.right>0&&g.right<=f,v=t?u||s:u&&s,b=t?c||a:c&&a;if("both"===o)return l&&v&&b;if("vertical"===o)return l&&v;if("horizontal"===o)return l&&b}else{var d=i.scrollTop(),p=d+h,w=i.scrollLeft(),m=w+f,y=r.offset(),z=y.top,B=z+r.height(),C=y.left,R=C+r.width(),j=t===!0?B:z,q=t===!0?z:B,H=t===!0?R:C,L=t===!0?C:R;if("both"===o)return!!l&&p>=q&&j>=d&&m>=L&&H>=w;if("vertical"===o)return!!l&&p>=q&&j>=d;if("horizontal"===o)return!!l&&m>=L&&H>=w}}}}(jQuery);
/*!
 * parallax.js v1.5.0 (http://pixelcog.github.io/parallax.js/)
 * @copyright 2016 PixelCog, Inc.
 * @license MIT (https://github.com/pixelcog/parallax.js/blob/master/LICENSE)
 */
!function(t,i,e,s){function o(i,e){var h=this;"object"==typeof e&&(delete e.refresh,delete e.render,t.extend(this,e)),this.$element=t(i),!this.imageSrc&&this.$element.is("img")&&(this.imageSrc=this.$element.attr("src"));var r=(this.position+"").toLowerCase().match(/\S+/g)||[];if(r.length<1&&r.push("center"),1==r.length&&r.push(r[0]),"top"!=r[0]&&"bottom"!=r[0]&&"left"!=r[1]&&"right"!=r[1]||(r=[r[1],r[0]]),this.positionX!==s&&(r[0]=this.positionX.toLowerCase()),this.positionY!==s&&(r[1]=this.positionY.toLowerCase()),h.positionX=r[0],h.positionY=r[1],"left"!=this.positionX&&"right"!=this.positionX&&(isNaN(parseInt(this.positionX))?this.positionX="center":this.positionX=parseInt(this.positionX)),"top"!=this.positionY&&"bottom"!=this.positionY&&(isNaN(parseInt(this.positionY))?this.positionY="center":this.positionY=parseInt(this.positionY)),this.position=this.positionX+(isNaN(this.positionX)?"":"px")+" "+this.positionY+(isNaN(this.positionY)?"":"px"),navigator.userAgent.match(/(iPod|iPhone|iPad)/))return this.imageSrc&&this.iosFix&&!this.$element.is("img")&&this.$element.css({backgroundImage:"url("+this.imageSrc+")",backgroundSize:"cover",backgroundPosition:this.position}),this;if(navigator.userAgent.match(/(Android)/))return this.imageSrc&&this.androidFix&&!this.$element.is("img")&&this.$element.css({backgroundImage:"url("+this.imageSrc+")",backgroundSize:"cover",backgroundPosition:this.position}),this;this.$mirror=t("<div />").prependTo(this.mirrorContainer);var a=this.$element.find(">.parallax-slider"),n=!1;0==a.length?this.$slider=t("<img />").prependTo(this.$mirror):(this.$slider=a.prependTo(this.$mirror),n=!0),this.$mirror.addClass("parallax-mirror").css({visibility:"hidden",zIndex:this.zIndex,position:"fixed",top:0,left:0,overflow:"hidden"}),this.$slider.addClass("parallax-slider").one("load",function(){h.naturalHeight&&h.naturalWidth||(h.naturalHeight=this.naturalHeight||this.height||1,h.naturalWidth=this.naturalWidth||this.width||1),h.aspectRatio=h.naturalWidth/h.naturalHeight,o.isSetup||o.setup(),o.sliders.push(h),o.isFresh=!1,o.requestRender()}),n||(this.$slider[0].src=this.imageSrc),(this.naturalHeight&&this.naturalWidth||this.$slider[0].complete||a.length>0)&&this.$slider.trigger("load")}!function(){for(var t=0,e=["ms","moz","webkit","o"],s=0;s<e.length&&!i.requestAnimationFrame;++s)i.requestAnimationFrame=i[e[s]+"RequestAnimationFrame"],i.cancelAnimationFrame=i[e[s]+"CancelAnimationFrame"]||i[e[s]+"CancelRequestAnimationFrame"];i.requestAnimationFrame||(i.requestAnimationFrame=function(e){var s=(new Date).getTime(),o=Math.max(0,16-(s-t)),h=i.setTimeout(function(){e(s+o)},o);return t=s+o,h}),i.cancelAnimationFrame||(i.cancelAnimationFrame=function(t){clearTimeout(t)})}(),t.extend(o.prototype,{speed:.2,bleed:0,zIndex:-100,iosFix:!0,androidFix:!0,position:"center",overScrollFix:!1,mirrorContainer:"body",refresh:function(){this.boxWidth=this.$element.outerWidth(),this.boxHeight=this.$element.outerHeight()+2*this.bleed,this.boxOffsetTop=this.$element.offset().top-this.bleed,this.boxOffsetLeft=this.$element.offset().left,this.boxOffsetBottom=this.boxOffsetTop+this.boxHeight;var t,i=o.winHeight,e=o.docHeight,s=Math.min(this.boxOffsetTop,e-i),h=Math.max(this.boxOffsetTop+this.boxHeight-i,0),r=this.boxHeight+(s-h)*(1-this.speed)|0,a=(this.boxOffsetTop-s)*(1-this.speed)|0;r*this.aspectRatio>=this.boxWidth?(this.imageWidth=r*this.aspectRatio|0,this.imageHeight=r,this.offsetBaseTop=a,t=this.imageWidth-this.boxWidth,"left"==this.positionX?this.offsetLeft=0:"right"==this.positionX?this.offsetLeft=-t:isNaN(this.positionX)?this.offsetLeft=-t/2|0:this.offsetLeft=Math.max(this.positionX,-t)):(this.imageWidth=this.boxWidth,this.imageHeight=this.boxWidth/this.aspectRatio|0,this.offsetLeft=0,t=this.imageHeight-r,"top"==this.positionY?this.offsetBaseTop=a:"bottom"==this.positionY?this.offsetBaseTop=a-t:isNaN(this.positionY)?this.offsetBaseTop=a-t/2|0:this.offsetBaseTop=a+Math.max(this.positionY,-t))},render:function(){var t=o.scrollTop,i=o.scrollLeft,e=this.overScrollFix?o.overScroll:0,s=t+o.winHeight;this.boxOffsetBottom>t&&this.boxOffsetTop<=s?(this.visibility="visible",this.mirrorTop=this.boxOffsetTop-t,this.mirrorLeft=this.boxOffsetLeft-i,this.offsetTop=this.offsetBaseTop-this.mirrorTop*(1-this.speed)):this.visibility="hidden",this.$mirror.css({transform:"translate3d("+this.mirrorLeft+"px, "+(this.mirrorTop-e)+"px, 0px)",visibility:this.visibility,height:this.boxHeight,width:this.boxWidth}),this.$slider.css({transform:"translate3d("+this.offsetLeft+"px, "+this.offsetTop+"px, 0px)",position:"absolute",height:this.imageHeight,width:this.imageWidth,maxWidth:"none"})}}),t.extend(o,{scrollTop:0,scrollLeft:0,winHeight:0,winWidth:0,docHeight:1<<30,docWidth:1<<30,sliders:[],isReady:!1,isFresh:!1,isBusy:!1,setup:function(){function s(){if(p==i.pageYOffset)return i.requestAnimationFrame(s),!1;p=i.pageYOffset,h.render(),i.requestAnimationFrame(s)}if(!this.isReady){var h=this,r=t(e),a=t(i),n=function(){o.winHeight=a.height(),o.winWidth=a.width(),o.docHeight=r.height(),o.docWidth=r.width()},l=function(){var t=a.scrollTop(),i=o.docHeight-o.winHeight,e=o.docWidth-o.winWidth;o.scrollTop=Math.max(0,Math.min(i,t)),o.scrollLeft=Math.max(0,Math.min(e,a.scrollLeft())),o.overScroll=Math.max(t-i,Math.min(t,0))};a.on("resize.px.parallax load.px.parallax",function(){n(),h.refresh(),o.isFresh=!1,o.requestRender()}).on("scroll.px.parallax load.px.parallax",function(){l(),o.requestRender()}),n(),l(),this.isReady=!0;var p=-1;s()}},configure:function(i){"object"==typeof i&&(delete i.refresh,delete i.render,t.extend(this.prototype,i))},refresh:function(){t.each(this.sliders,function(){this.refresh()}),this.isFresh=!0},render:function(){this.isFresh||this.refresh(),t.each(this.sliders,function(){this.render()})},requestRender:function(){var t=this;t.render(),t.isBusy=!1},destroy:function(e){var s,h=t(e).data("px.parallax");for(h.$mirror.remove(),s=0;s<this.sliders.length;s+=1)this.sliders[s]==h&&this.sliders.splice(s,1);t(e).data("px.parallax",!1),0===this.sliders.length&&(t(i).off("scroll.px.parallax resize.px.parallax load.px.parallax"),this.isReady=!1,o.isSetup=!1)}});var h=t.fn.parallax;t.fn.parallax=function(s){return this.each(function(){var h=t(this),r="object"==typeof s&&s;this==i||this==e||h.is("body")?o.configure(r):h.data("px.parallax")?"object"==typeof s&&t.extend(h.data("px.parallax"),r):(r=t.extend({},h.data(),r),h.data("px.parallax",new o(this,r))),"string"==typeof s&&("destroy"==s?o.destroy(this):o[s]())})},t.fn.parallax.Constructor=o,t.fn.parallax.noConflict=function(){return t.fn.parallax=h,this},t(function(){t('[data-parallax="scroll"]').parallax()})}(jQuery,window,document);
/* Ajaxify v1 | Copyright (c) 2017 Elkfox Co Pty Ltd | https://elkfox.com | Project lead: George Butter | MIT License | https://github.com/Elkfox/Ajaxify */
ajaxify = function(settings) {
  settings = settings || {}
  // Change the default selectors here
  var linkParent = settings.linkParent || '.pagination' // Class of pagination container
  var parentContainer = settings.parentContainer || '#MainContent' // All of the content selector used to detect scroll bottom distance
  var endlessScrollContainer = settings.endlessScrollContainer || '.EndlessScroll' // Selector for endless scroll pages
  var endlessClickContainer = settings.endlessClickContainer || '.EndlessClick' // Class of pagination container
  var endlessOffset = settings.endlessOffset || 0 // Offset the distance from the bottom of the page
  var ajaxinateContainer = settings.ajaxinateContainer || '.Ajaxinate' // ID Selector for ajax pagination pages
  var ajaxinateLink = settings.ajaxinateLink || '.page a' // Class Selector for ajax pagination links
  var fade = settings.fade || 'fast' // fade speed
  var textChange = settings.textChange || 'Loading' // Text whilst loading content
  const callback = settings.callback || false

  var linkElem;
  var contentContainer;
  var pageNumber;
  var pageType;
  var action;
  var moreURL;

  $.loadMore = function() {
    if (moreURL.length){
      $.ajax({
        type: 'GET',
        dataType: 'html',
        url: moreURL,
        success: function(data) {
          if (pageType == 'ajax') {
            $(ajaxinateContainer).not('[data-page="'+pageNumber+'"]').hide();
            history.pushState({}, pageNumber, moreURL);
          } else {
            $(linkElem).fadeOut(fade);
          }

          var filteredData = $(data).find(contentContainer).html();
          $(contentContainer)
          	.find('.visually-hidden')
          		.removeClass('visually-hidden')
          	.end()
          	.find('.gridSpacer, .pagination').remove().end().append( filteredData );

          if (pageType == 'endlessScroll') {
            $.endlessScroll();
          } else if (pageType == 'ajax') {
            $.ajaxinationClick();
          } else if (pageType == 'endlessClick') {
            $.endlessClick();
          }
          $(document).trigger('ajaxify:updated', [data]);
          if(callback && typeof(callback) === 'function') {
            callback(data);
          }
        }
      });
    } else {
    	$(contentContainer).find('.visually-hidden').removeClass('visually-hidden');

    	// Simulate ajaxify update
    	$(document).trigger('ajaxify:updated');
    }
  }

  // Check whether the page is at the bottom
  $.endlessScroll = function() {
    action = 'scroll load resize';
    $(window).on( action, function() {
      contentContainer = endlessScrollContainer;
      moreURL = $(contentContainer+':last-of-type '+linkElem).attr('href');
      pageType = 'endlessScroll';
      $(linkElem).text(textChange);
      if ($(contentContainer+':last-of-type '+linkElem).length){
        var bottom = $( parentContainer ).outerHeight();
        var docTop = ($(document).scrollTop() + $(window).height() + endlessOffset);
        if( docTop > bottom ) {
          $(window).off(action);
        	$.loadMore();
        }
      }
    });
  }

  //Endless click function
  $.endlessClick = function() {
    $(linkElem).on( 'click', function(e) {
      e.preventDefault();
      action = 'click';
      contentContainer = endlessClickContainer;
      moreURL = $(this).attr('href');
      pageType = 'endlessClick';
      $(linkElem).text(textChange);
      $(linkElem).off(action);
      $(linkElem).on('click', function(e) {
  		e.preventDefault();
  	  });

      $.loadMore();
    });
  }

  //Ajaxination click function
  $.ajaxinationClick = function() {
    $(linkElem).on( 'click', function(e) {
      e.preventDefault();
      action = 'click';
      contentContainer = ajaxinateContainer;
      moreURL = $(this).attr('href');
      pageNumber = $(this).attr('data-number');
      pageType = 'ajax';
      if( $(contentContainer+'[data-page="'+pageNumber+'"]').length ) {
        $(contentContainer).not('[data-page="'+pageNumber+'"]').hide();
        $(contentContainer+'[data-page="'+pageNumber+'"]').fadeIn(fade);
        history.pushState({}, pageNumber, moreURL);
      } else {
        $(linkElem).off(action);
        $.loadMore();
      }
      $('html, body').animate({ scrollTop: $(parentContainer).offset().top }, 300 );
    });
  }

  // Detect whether the pagination types exist
    // Endless Click Initialize
  if ( $( endlessClickContainer ).length ) {
    linkElem = linkParent+' a';
    $.endlessClick();
  }
    // Ajaxination Click Initialize
  if ( $( ajaxinateContainer ).length ) {
    linkElem = ajaxinateLink;
    $.ajaxinationClick();
  }
    // Endless Scroll Initialize
  if ( $( endlessScrollContainer ).length ) {
    linkElem = linkParent+' a';
    $.endlessScroll();
  }

}


jQuery( function ($) {
	var Sections = {
		init: function() {
			$( document )
				.on( 'shopify:section:load', this._onSectionLoad )
				.on( 'shopify:section:unload', this._onSectionUnload )
				.on( 'shopify:section:select', this._onSectionSelect )
				.on( 'shopify:section:deselect', this._onSectionDeselect )
				.on( 'shopify:block:select', this._onBlockSelect )
				.on( 'shopify:block:deselect', this._onBlockDeselect );
		},

		/**
		 * A section has been added or re-rendered.
		 */
		_onSectionLoad: function( e ) {
			var section = e.target.children[ 0 ].getAttribute( 'data-section-type' ) || e.target.children[ 1 ].getAttribute( 'data-section-type' ) || e.target.children[ 2 ].getAttribute( 'data-section-type' ) || false;

			Site.images.loadBackgrounds();
			Site.animations.init();

			switch( section ) {
				case 'header':
					_loadHeader( e.target );
					break;
				case 'footer':
					_loadFooter( e.target );
					break;
				case 'featured-product':
					_loadFeaturedProduct( e.target );
					break;
				case 'instagram':
					_loadInstagram( e.target );
					break;
				case 'gallery':
					_loadGallery( e.target );
					break;
				case 'mosaic':
					_loadMosaic( e.target );
				case 'testimonials':
					_loadTestimonials( e.target );
					break;
				case 'map':
					_loadGmap( e.target );
					break;
				case 'slideshow':
					_loadHero( e.target );
					break;
				case 'collection-template':
					_loadCollectionTemplate( e.target );
					break;
				case 'featured-collection':
					_loadFeaturedCollection( e.target );
					break;
				case 'collection-grid':
					_loadListCollections( e.target );
					break;
				case 'product-template':
					_loadProductTemplate( e.target );
					break;
				case 'blog-template':
					_loadBlogTemplate( e.target );
					break;
				case 'featured-blog':
					_loadFeaturedBlog( e.target );
					break;
				case 'featured-video':
					_loadFeaturedVideo( e.target );
					break;
				case 'logos-list':
					_loadLogosList( e.target );
					break;
				case 'about-template':
					_loadAboutTemplate( e.target );
					break;
				case 'faq-template':
					_loadFaqList( e.target );
					break;
				case 'faq-section':
					_loadFaqList( e.target );
					break;

			}

			function _loadHeader( t ) {
				var btn = $( '.js-menuToggle' );
				var page = $( 'body, html' );
				var content = $( '.bodyWrap' );
				var header = $( '.site-header' );

				var resetHeader = function() {
					page.removeClass( 'nav--is-visible' );
					content.removeAttr( 'style' );
					$('.header-fix-cont-inner, .bodyWrap, .siteAlert, .main-logo').css('transform','none');
				}

				var setHeaderPosition = function() {
					var promo = $('.js-siteAlert');
					var promoHeight = promo.outerHeight();

					if ( promo.length ){
						header.addClass( 'alert--is-visible shift--alert' );

						$( window ).on('scroll', Reqs.throttle(function(){
							( $( window ).scrollTop() >= promoHeight ) ? header.removeClass( 'shift--alert' ) : header.addClass( 'shift--alert' );
						}, 50));
					}
				}

				resetHeader();

				setHeaderPosition();

				Site.nav.hide();
				Site.nav.init();
				Site.header();

				Search.init();
				if ( !$('.template-cart').length ) {
					Cart.init();
				}

				setTimeout( function() {
					$(window).scroll();
				}, 100);
			}

			function _loadFooter( t ) {
				Site.footer();
			}

			function _loadInstagram( t ) {
				Insta.init();
			}

			function _loadFeaturedProduct( t ) {
				FeaturedProduct.init();

				// Re-initialize Reviews
				var showReviews = $( t ).find('.js-product-template').data('show_reviews');
				if ( showReviews && typeof( window.SPR ) == 'function') {
					window.SPR.initDomEls();
					window.SPR.loadBadges();
				}
			}

			function _loadGmap( t ) {
				Gmap.init( );
			}

			function _loadFeaturedBlog( t ) {
				var itemSelector = $( t ).find('.blogModule-posts');

				Blog.init();
				Blog.truncateText(itemSelector);
				$(window).resize(Reqs.throttle(Blog.truncateText(itemSelector), 50));
			}

			function _loadBlogTemplate( t ) {
				// Reload ajaxify
				ajaxify();
				Blog.init();
			}

			function _loadGallery( t ) {

					var slider, options;

					slider = $( t ).find( '.js-slider' );
					options = JSON.parse( slider.data( 'slick' ).replace(/'/g, '"') );

					// Resizes background image without stretching it
					if ( slider.data('image-height') == 'original-height' ){
						Site.sliders.setSlidesHeight( slider );
						$(window).resize(
							Reqs.debounce(function(event){
								Site.sliders.setSlidesHeight( slider );
						}, 250));
					}

					slider.on('init', function() {
						$(this).removeClass('gallery-slider--is-loading');
					});

					slider.slick( options );

			}

			function _loadMosaic( t ) {

					var slider = $('.js-mosaic__blocks');

					Site.sliders.initMobileSlider(slider);
					$(window).resize(
						Reqs.debounce( function(event) {
						Site.sliders.initMobileSlider(slider);
					}, 250));

					if ( typeof(Currency) != 'undefined' && Currency ){
					    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
					    onCurrencySet();
					}

			}

			function _loadTestimonials( t ) {

					var slider = $('.js-testimonials__blocks');

					Site.sliders.initMobileSlider(slider);
					$(window).resize(
						Reqs.debounce( function(event) {
						Site.sliders.initMobileSlider(slider);
					}, 250));

			}

			function _loadHero( t ) {
				var hero, options, scrollDownBtn;

				hero = $( t ).find( '.js-hero-slider' );
				options = JSON.parse( hero.data( 'slick' ).replace(/'/g, '"') );
				
				// Resizes background image without stretching it
				if ( hero.data('image-height') == 'original-height' ){
					Site.sliders.setSlidesHeight( hero );
					$(window).resize(
						Reqs.debounce(function(event){
							Site.sliders.setSlidesHeight( hero );
					}, 250));
				}

				hero.on('init', function() {
					var currentStyle = $(this).find('.js-slide[data-slick-index="1"]').data('style');
					$(this).attr('data-current-style', currentStyle);
					$(this).removeClass('hero--is-loading');
				});

				hero.on('beforeChange', function(event, slick, currentSlide, nextSlide) {
					var activeSlide = parseInt(nextSlide + 1);
					var currentStyle = $(this).find('.js-slide[data-slick-index="' + activeSlide +'"]').data('style');
					$(this).attr('data-current-style', currentStyle);
				});

				hero.slick( options );

				scrollDownBtn = $( t ).find('.js-scroll-down');
				scrollDownBtn.on('click', function(e) {
					e.preventDefault();
					var isStandardNav = $(window).width() >= 768 && $('.site-header').hasClass('is-standard');
					var headerHeight = isStandardNav ? 59 : -1;
					var scrollToPosition = parseInt(hero.offset().top + hero.outerHeight() - headerHeight);
					$('html, body').stop(true, false).animate({ 'scrollTop': scrollToPosition }, 500);
				});

				var page = $( 'body, html' );
				var content = $( '.bodyWrap' );
				var header = $( '.site-header' );

				var resetHeader = function() {
					page.removeClass( 'nav--is-visible' );
					content.removeAttr( 'style' );
					$('.header-fix-cont-inner, .bodyWrap, .siteAlert, .main-logo').css('transform','none');
				}

				var setHeaderPosition = function() {
					var promo = $('.js-siteAlert');
					var promoHeight = promo.outerHeight();

					if ( promo.length ){
						header.addClass( 'alert--is-visible shift--alert' );

						$( window ).on('scroll', Reqs.throttle(function(){
							( $( window ).scrollTop() >= promoHeight ) ? header.removeClass( 'shift--alert' ) : header.addClass( 'shift--alert' );
						}, 50));
					}
				}

				resetHeader();

				setHeaderPosition();

				// Header fix if no slideshow
				var enableHero = true;
				Site.header( enableHero );

				// Trigger scroll to change the header style
				setTimeout( function() {
					$(window).scroll();
				}, 100);
			}

			function _loadFeaturedCollection( t ) {
				var collectionList = $( t ).find('.js-collectionGrid');
				var carousel = collectionList.find( '.js-collection-slider' );
				var item = '.collectionBlock';
				QuickView.init();

				// Re-initialize Reviews
				var showReviews = collectionList.data('show_reviews');
				if ( showReviews && typeof( window.SPR ) == 'function') {
					window.SPR.initDomEls();
					window.SPR.loadBadges();
				}

				
				$(window).on('resize', Reqs.debounce(function() {
					Site.setBadgePosition();
					Site.sliders.setCarouselState( collectionList );
				}, 250));

				if ( typeof(Currency) != 'undefined' && Currency ){
				    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
				    onCurrencySet();
				}

				Site.setBadgePosition();
				Site.sliders.setCarouselState( collectionList );
				Site.scroller( carousel, item );
			}

			function _loadCollectionTemplate( t ) {
				var collectionList = $( t ).find('.js-collectionGrid');
				var showReviews = collectionList.data('show_reviews');

				Collection.init();
				Site.sliders.init();
				QuickView.init();

				// Re-initialize Reviews
				if ( showReviews && typeof( window.SPR ) == 'function') {
					window.SPR.initDomEls();
					window.SPR.loadBadges();
				}
				
				$(window).on('resize', Reqs.debounce(function() {
					Site.setBadgePosition();
				}, 250));

				Site.setBadgePosition();
			}

			function _loadListCollections( t ) {
				var collectionList = $( t ).find('.js-collection-grid');
				
				$(window)
					.on('load', function() {
						ListCollections.truncateBlockText(collectionList);
					})
					.on('resize', Reqs.throttle(function() {
						ListCollections.truncateBlockText(collectionList);
				}, 50));
			}

			function _loadFeaturedVideo( t ) {
				Site.video();
			}

			function _loadLogosList( t ) {
				var slider, options;

				slider = $( t ).find( '.js-logos-slider' );
				options = {
			        'infinite': true,
			        'autoplay': false,
			        'speed': 300,
			        'slidesToShow': 8,
			        'centerPadding': '80px',
			        'arrows': true,
			        'dots': false,
			        'responsive': [
			            {
			              'breakpoint': 1440,
			              'settings': {
			                'centerPadding': '40px',
			                'slidesToShow': 6
			              }
			            },
			            {
			              'breakpoint': 1024,
			              'settings': {
			                'centerPadding': '30px',
			                'slidesToShow': 5
			              }
			            },
			            {
			              'breakpoint': 992,
			              'settings': {
			                'centerPadding': '25px',
			                'slidesToShow': 4
			              }
			            },
			            {
			              'breakpoint': 768,
			              'settings': {
			                'centerPadding': '20px',
			                'slidesToShow': 3
			              }
			            },
			            {
			              'breakpoint': 640,
			              'settings': {
			                'centerPadding': '15px',
			                'slidesToShow': 2
			              }
			            },
			            {
			              'breakpoint': 375,
			              'settings': {
			                'centerPadding': '10px',
			                'slidesToShow': 1
			              }
			            }
			        ]
			    };

				slider.slick( options );
			}

			function _loadProductTemplate( t ) {
				if(!$('body').hasClass('template-index')){
					var productTemplate = $( t );
					var update = true;
					var product = JSON.parse(document.getElementById('product-json').innerHTML);
					var enableColorSwatches = $('.productForm').data('color_swatches');

					Product.init( update );

					Site.sliders.init();
					Site.video();
				}

				// Re-initialize Reviews
				var showReviews = $('.js-product-template').data('show_reviews');

				if ( showReviews && typeof( window.SPR ) == 'function') {
					window.SPR.initDomEls();
					window.SPR.loadBadges();
					window.SPR.loadProducts();
				}
			}

			function _loadAboutTemplate( t ) {
				Site.checkBanner();
			}

			function _loadFaqList( t ) {
				var $faqList = $( t ).find( '.faq-list' );

				$faqList.on('click', '.faq-list__item-question', function() {
					$(this).parent().toggleClass('is-expanded');
				});
			}
		},

		/**
		 * A section has been deleted or is being re-rendered.
		 */
		_onSectionUnload: function( e ) {
			var section = e.target.children[ 0 ].getAttribute( 'data-section-type' ) || false;

			switch( section ) {
				case 'instagram':
					_unloadInstagram( e.target );
					break;
				case 'gallery':
					_unloadGallery( e.target );
					break;
				case 'slideshow':
					_unloadHero( e.target );
					break;
				case 'logos-list':
					_unloadLogosList( e.target );
					break;
				case 'mosaic':
					_unloadMosaic( e.target );
					break;
				case 'testimonials':
					_unloadTestimonials( e.target );
					break;
				case 'popup':
					_unloadPopup( e.target );
					break;
			}

			function _unloadInstagram( t ) {
				var slider = $( t ).find( '.js-instafeed' );

				slider.slick( 'unslick' );
			}

			function _unloadGallery( t ) {
				var slider = $( t ).find( '.js-slider' );

				slider.slick( 'unslick' );
			}

			function _unloadHero( t ) {
				var hero = $( t ).find( '.js-hero-slider' );

				hero.slick( 'unslick' );

				var page = $( 'body, html' );
				var content = $( '.bodyWrap' );
				var header = $( '.site-header' );

				var resetHeader = function() {
					page.removeClass( 'nav--is-visible' );
					content.removeAttr( 'style' );
					$('.header-fix-cont-inner, .bodyWrap, .siteAlert, .main-logo').css('transform','none');
				}

				var setHeaderPosition = function() {
					var promo = $('.js-siteAlert');
					var promoHeight = promo.outerHeight();

					if ( promo.length ){
						header.addClass( 'alert--is-visible shift--alert' );

						$( window ).on('scroll', Reqs.throttle(function(){
							( $( window ).scrollTop() >= promoHeight ) ? header.removeClass( 'shift--alert' ) : header.addClass( 'shift--alert' );
						}, 50));
					}
				}

				resetHeader();

				setHeaderPosition();

				// Header fix if no slideshow
				var enableHero = false;
				Site.header( enableHero );

				// Trigger scroll to change the header style
				setTimeout( function() {
					$(window).scroll();
				}, 100);
			}

			function _unloadLogosList( t ) {
				var slider = $( t ).find( '.js-logos-slider' );

				slider.slick( 'unslick' );
			}

			function _unloadMosaic( t ) {
				var slider = $( t ).find( '.js-mosaic__blocks' );
				var isSlickActive = slider.hasClass('slick-initialized');

				if ( isSlickActive ) {
					slider.slick( 'unslick' );	
				}
				
			}

			function _unloadTestimonials( t ) {
				var slider = $( t ).find( '.js-testimonials__blocks' );

				slider.slick( 'unslick' );
			}

			function _unloadPopup( t ) {
				Popup.hide();
			}

		},

		/**
		 * User has selected the section in the sidebar.
		 */
		_onSectionSelect: function( e ) {
			var section = e.target.children[ 0 ].getAttribute( 'data-section-type' ) || e.target.children[ 1 ].getAttribute( 'data-section-type' ) || e.target.children[ 2 ].getAttribute( 'data-section-type' ) || false;
			
			switch( section ) {
				case 'header':
					_selectHeader( e.target );
					break;
				case 'blog-template':
					_selectBlog( e.target );
					break;
				case 'popup':
					_selectPopup( e.target );
					break;
				case 'collection-grid':
					_selectListCollection( e.target );
					break;
			}

			function _selectHeader( t ) {
				var btn = $( '.js-menuToggle' );
				var page = $( 'body, html' );
				var content = $( '.bodyWrap' );
				var header = $( '.site-header' );

				var resetHeader = function() {
					page.removeClass( 'nav--is-visible' );
					content.removeAttr( 'style' );
					$('.header-fix-cont-inner, .bodyWrap, .siteAlert, .main-logo').css('transform','none');

					if ( $( 'body' ).hasClass( 'cart--is-visible' ) ) {
						$( '.js-cartToggle' ).click();	
					}
				}

				var setHeaderPosition = function() {
					var promo = $('.js-siteAlert');
					var promoHeight = promo.outerHeight();

					if ( promo.length ){
						header.addClass( 'alert--is-visible shift--alert' );

						$( window ).on('scroll', function(){
							( $( window ).scrollTop() >= promoHeight ) ? header.removeClass( 'shift--alert' ) : header.addClass( 'shift--alert' );
						});
					}
				}

				resetHeader();

				setHeaderPosition();
				Site.nav.hide();
				Site.header();

				$('.header-fix-cont-inner').css('opacity','1');
			}

			function _selectPopup( t ) {
				Popup.init();
			}

			function _selectBlog( t ) {
				var itemSelector = $( t ).find('.blogModule-posts');

				Blog.truncateText(itemSelector);
				$(window).resize(Reqs.throttle(Blog.truncateText(itemSelector), 50));
			}

			function _selectListCollection( t ) {
				var collectionList = $( t ).find('.js-collection-grid');
				
				ListCollections.truncateBlockText(collectionList);
			}
		},

		/**
		 * User has selected the section in the sidebar.
		 */
		_onSectionDeselect: function( e ) {
			var section = e.target.children[ 0 ].getAttribute( 'data-section-type' ) || false;

			switch( section ) {
				case 'header':
					_deselectHeader( e.target );
					break;
			}

			function _deselectHeader( t ) {
				Site.nav.hide();
			}

		},

		/**
		 * User has selected the block in the sidebar.
		 */
		_onBlockSelect: function( e ) {
			var block = e.target.getAttribute( 'data-block' ) || false;

			switch( block ) {
				case 'slide':
					_selectBlockSlide( e.target );
					break;
				case 'banner':
					_selectBlockBanner( e.target );
					break;
				case 'mosaic':
					_selectBlockMosaic( e.target );
					break;
				case 'testimonial':
					_selectBlockTestimonial( e.target );
					break;
				case 'item_logo':
					_selectBlockItemLogo( e.target );
					break;
			}

			function _selectBlockSlide( t ) {
				var slider, index;

				slider = $( t ).parents( '.slick-slider' );
				index = $( t ).parents('.slick-slide:not(.slick-cloned)').attr( 'data-slick-index' );

				slider.addClass( 'no-transition' );
				slider.slick( 'slickGoTo', index );
				slider.slick( 'slickPause' );

				$( slider ).find( '.slick-current' ).on( 'lazybeforeunveil', function() {
					Site.sliders.setSlidesHeight( slider );	
				});
				
			}

			function _selectBlockBanner( t ) {
				Site.checkBanner();
			}

			function _selectBlockMosaic( t ) {
				var slider = $( t ).parents( '.js-mosaic__blocks' ),
					isSlickActive = slider.hasClass('slick-initialized'),
					index;
				
				if (isSlickActive) {
					index = $( t ).parents('.slick-slide:not(.slick-cloned)').attr( 'data-slick-index' );

					slider.addClass('no-transition')
					slider.slick( 'slickGoTo', index );
					slider.slick( 'slickPause' );
				}

				if ( typeof(Currency) != 'undefined' && Currency ){
				    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
				    onCurrencySet();
				}
			}

			function _selectBlockTestimonial( t ) {
				var slider = $( t ).parents( '.js-testimonials__blocks' ),
					isSlickActive = slider.hasClass('slick-initialized'),
					index;
				
				if (isSlickActive) {
					index = $( t ).parents('.slick-slide:not(.slick-cloned)').attr( 'data-slick-index' );

					slider.slick( 'slickGoTo', index );
					slider.slick( 'slickPause' );
				}
			}

			function _selectBlockItemLogo( t ) {
				var slider, index;

				slider = $( t ).parents( '.js-logos-slider' );
				index = $( t ).parents('.slick-slide:not(.slick-cloned)').attr( 'data-slick-index' );

				slider.slick( 'slickGoTo', index );
			}

		},

		/**
		 * User has DEselected the block in the sidebar.
		 */
		_onBlockDeselect: function( e ) {
			var block = e.target.getAttribute( 'data-block' ) || false;

			switch( block ) {
				case 'slide':
					_deselectBlockSlide( e.target );
					break;
				case 'item_logo':
					_deselectBlockItemLogo( e.target );
					break;
			}

			function _deselectBlockSlide( t ) {
				var slider;

				slider = $( t ).parents( '.slick-slider' );
				slider.slick('slickPlay');
				slider.removeClass('no-transition')
			}

			function _deselectBlockItemLogo( t ) {
				var slider;

				slider = $( t ).parents( '.js-logos-slider' );
				slider.slick('slickPlay');
			}
		}
	}

	var s;
	window.Site = {
		settings: {
			b: $('body'),
			w: $(window),
			d: $(document)
		},

		init: function(){
			s = this.settings;

			this.general();
			this.animations.init();
			this.header();
			this.footer();
			this.nav.init();
			this.sliders.init();
			this.images.loadBackgrounds();
			this.addresses.init();
			this.webkitSizing();
			this.keyboardAccessible();
			this.video();
			this.faq();
			this.checkReviewsApp();
			this.checkBanner();
			
			if ($('.js-siteAlert').length){
				this.promo.init();
			}
			if (this.getQueryParameter('customer_posted') == "true") {
				$('body').addClass('signUp-posted');
				s.d.scrollTop( s.d.height() - s.w.height() );
			}
		},

		/*
		 * General Bindings
		 */
		general: function(){
			// Fast click
			FastClick.attach(document.body);

			// Social sharing links
			s.b.on('click', '.share-link', function(event) {

				event.preventDefault();

				var el = $(this),
					popup = el.attr('data-network'),
					link = el.attr('href'),
					w = 700,
					h = 400;

				switch (popup) {
					case 'twitter':
						h = 300;
						break;
					case 'googleplus':
						w = 500;
						break;
				}

				window.open(link, popup, 'width=' + w + ', height=' + h);

			});

			s.spinner = $('#Spinner').html();

		},

		getQueryParameter: function(name) {
			name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
			var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
				results = regex.exec(location.search);
			return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
		},

		keyboardAccessible: function(){
			s.w.mousedown(function(event) {
				s.b.addClass("no-outline");
			});
			s.w.keyup(function(event) {
				if ( event.keyCode === 9 ) {
					s.b.removeClass("no-outline");
				}
			});
		},

		webkitSizing: function(){
			if (Modernizr.touch){
				var ww = $(window).outerWidth();
				var nw = Site.nav.getWidth();

				$('html, body').css({'max-width': ww});
				// Size offcanvas nav
				$('.nav-container').css({'width': nw});
				// Size header
				$('.site-header').css({'width': ww});

				$(window).resize(function(){
					var ww = $(window).outerWidth();
					var nw = Site.nav.getWidth();

					$('html, body').css({'max-width': ww});
					// Size offcanvas nav
					$('.nav-container').css({'width': nw});
					// Size header
					$('.site-header').css({'width': ww});
				});
			}
		},

		/*
		 * Header Scroll Function
		 */
		header: function( enableHero = null ){
			var $header = $('.site-header'),
				scroll = 0,
				heroEnabled = enableHero != null ? enableHero : $('.hero').length,
				heroHeight = $('.hero').outerHeight(),
				alertHeight = $('.siteAlert').outerHeight();

			if (!$('.template-index').length) {
				$header.removeClass('header--no-bg');

				$(window).on('scroll', function(){
					scroll = $(window).scrollTop();

					if (scroll > alertHeight) {
						$header.addClass('has-scrolled');
					} else {
						$header.removeClass('has-scrolled');
					}
				});
			} else {
				/* Desktop with hero enabled (wait until after hero to transition header) */
				$(window).on('scroll', function(){
					scroll = $(window).scrollTop();
					heroEnabled = $('.hero').length;

					if (heroEnabled) {
						if (scroll > alertHeight) {
							$header.addClass('has-scrolled').removeClass('header--no-bg');
						} else {
							$header.removeClass('has-scrolled').addClass('header--no-bg');
						}
					} else {
						if (scroll > -1) {
							$header.addClass('has-scrolled');
						} else {
							$header.removeClass('has-scrolled');
						}
					}
				});
			}

			$(window).on('resize', function() {
				checkNavigationOverlapping();
				Site.setCartClosePosition();
			});
			
			setTimeout(checkNavigationOverlapping, 50);

			initPadding();

			$(document).on('shopify:section:reorder', function(event) {
				initPadding();
			});

			function initPadding(){
				if($('body').hasClass('template-index')){
					var firstSectionParent = $('.bodyWrap').children(":first");
					if ( !$(firstSectionParent).hasClass('header--full') || enableHero != null && enableHero == false ){
						$('.bodyWrap').addClass('mo-padding');
					} else {
						$('.bodyWrap').removeClass('mo-padding');
					}
				}
			}

			function checkNavigationOverlapping() {
				var isNavigationStandard = $('.site-header').hasClass('header--standard');

				if (isNavigationStandard) {
					var isNavigationOverlapping = getNavigationOverlapping();
					var isDesktop = $(window).width() >= 1024;

					if ( isNavigationOverlapping || !isDesktop ) {
						$('.site-header').removeClass('is-standard').addClass('is-hamburger');
					}
				}

				$header.css('opacity', 1);
			}

			function getNavigationOverlapping() {
				$('.site-header').addClass('is-standard').removeClass('is-hamburger');

				var isNavCentered = $('.site-header').hasClass('header--logo_center_links_center') || $('.site-header').hasClass('header--logo_left_links_center');
				var additionalSpace = 180; // Additional spacing from margins
				var isImageLogo = $('.main-logo .logo').length;
				var logoWidth = isImageLogo ? $('.main-logo .logo').width() : $('.main-logo #shopName').outerWidth();
				var headerContainerWidth = $('.site-header .container > .row').width();
				var navMenuWidth = $('.nav-standard .menu').outerWidth();
				var navSearchWidth = $('.nav-standard .searchToggle').outerWidth();

				if (isNavCentered) {
					logoWidth = logoWidth * 2;
				}

				return ( parseInt(headerContainerWidth) < parseInt(navMenuWidth + logoWidth + navSearchWidth + additionalSpace) );
			}
		},

		setCartClosePosition: function() {
			var cartBtnOffsetTop = $('#cartTotal').length ? $('#cartTotal').offset().top : 0;
			var cartBtnLeft = $('#cartTotal').length ? $('#cartTotal').offset().left : 0;
			var cartBtnClose = $('.cartContainer .js-cartToggle');
			var scrolled = $(window).scrollTop();
			if (cartBtnOffsetTop) {
				var cartBtnTop = cartBtnOffsetTop - scrolled;
				cartBtnClose.css({ 
					'top': cartBtnTop,
					'left': cartBtnLeft,
					'right': 'auto'
				});
			}
		},

		footer: function() {
			var $shopBar = $('#add-to-cart-bar');
			var $productContainer = $( '.js-product-template' );
			var $siteFooter = $( '.site-footer' );

			$(window).on('scroll', 
				Reqs.throttle(function(event){
					var scrolled = $(window).scrollTop();
					
					if ( $productContainer.length && $shopBar.length ) {
						var productContainerOffset = $productContainer.offset().top;

						if ( scrolled > productContainerOffset ) {
							$shopBar.addClass('product-bar--is-visible');
							$siteFooter.addClass('site-footer--push')
						} else if ( scrolled < productContainerOffset - 60 ) {
							$shopBar.removeClass('product-bar--is-visible');
							$siteFooter.removeClass('site-footer--push')
						}
					}
				}, 100)
			);
		},

		promo: {
			alert: $('.js-siteAlert'),
			header: $('.site-header'),
			promo_inner: $('.js-siteAlert .block'),

			init: function(){
				var alert = this.alert,
					promo_inner = this.promo_inner,
					content = alert.html();
					Site.promo.updateHeader();
					$('.header-fix-cont-inner').css('opacity','1');

				$('.js-alert-close').on('click', function(){
					alert.removeClass('no-transition');
					setTimeout(function(){
						Site.promo.hide();
					}, 500);
				});

				function _updateHeight() {
					var height = promo_inner.innerHeight();
					alert.css('height', height);
				}

				function _setCookie(cname, cvalue, exdays) {
					var d = new Date();
					d.setTime(d.getTime() + (exdays*24*60*60*1000));
					var expires = "expires="+d.toUTCString();
					document.cookie = cname + "=" + cvalue + "; " + expires;
				}

				function _getCookie(cname) {
					var name = cname + "=";
					var ca = document.cookie.split(';');
					for(var i=0; i<ca.length; i++) {
						var c = ca[i];
						while (c.charAt(0)==' ') c = c.substring(1);
						if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
					}
					return "";
				}

				function _checkCookie() {
					var user = getCookie("username");
					if (user != "") {
						alert("Welcome again " + user);
					} else {
						user = prompt("Please enter your name:", "");
						if (user != "" && user != null) {
							setCookie("username", user, 365);
						}
					}
				}
			},
			show: function(){
				var alert = this.alert,
					promo_inner = alert.find('.block'),
					height = promo_inner.innerHeight();

				alert.css({'height': height});

				Site.promo.updateHeader();

				$(window).resize(
					Reqs.throttle(function(event){
						var height = promo_inner.innerHeight();

						alert.css({'height': height});
					}, 500)
				);
			},
			hide: function(){
				var alert = this.alert,
					content = alert.html();

					alert.css({'height': 0});
				setTimeout(function(){
					alert.remove();
				}, 500);
			},
			updateHeader: function(){
				var alert = this.alert,
					height = alert.outerHeight(),
					header = this.header;

				header.addClass('alert--is-visible');

				header.addClass('shift--alert');

				$(window).on('scroll', Reqs.throttle(function(){
					var height = alert.outerHeight();

					if ($(window).scrollTop() >= height) {
						header.removeClass('shift--alert');
					} else {
						header.addClass('shift--alert');
					}
				}, 50));
			}
		},

		video: function(){
			Reqs.lightbox();
			$('.js-video').magnificPopup({
				closeMarkup: '<button title="%title%" type="button" class="mfp-close icon-close"></button>',
				type: 'iframe',
				mainClass: 'mfp-fade',
				removalDelay: 160,
				preloader: false,
				fixedContentPos: false,
				iframe: {
				  markup: '<div class="mfp-iframe-scaler">'+
							'<div class="mfp-close"></div>'+
							'<iframe class="mfp-iframe" frameborder="0" allowfullscreen></iframe>'+
						  '</div>', // HTML markup of popup, `mfp-close` will be replaced by the close button

				  patterns: {
					youtube: {
					  index: 'youtube.com/',
					  id: 'v=',
					  src: '//www.youtube.com/embed/%id%?autoplay=1&rel=0modestbranding=0' // URL that will be set as a source for iframe.
					},
				  },
				  srcAction: 'iframe_src', // Templating object key. First part defines CSS selector, second attribute. "iframe_src" means: find "iframe" and set attribute "src".
				}
			});
		},

		faq: function(){
			$('.faq-list__item-question', document).on('click', function() {
				$(this).parent().toggleClass('is-expanded');
			});
		},

		/*
		 * Sliders
		 */
		sliders: {
			init: function(){
				this.hero();
				this.carousel();
				this.collection();
				this.gallery();
				this.mosaic();
				this.testimonials();
				this.product();
				this.productTabs();
				this.logosList();
			},

			/* Homepage Hero Slider */
			hero: function(){
				var self = this;
				var hero = $( '.js-hero-slider' );
				var options = {};
				var scrollDownBtn = $('.js-scroll-down');

				if ( !Modernizr.cssvhunit || !Modernizr.cssvmaxunit ) hero.css( 'height', $(window).height() );

				hero.each( function () {
					var currentHero = $(this);
					options = JSON.parse( currentHero.data( 'slick' ).replace(/'/g, '"') );

					currentHero.on('init', function() {
						var currentStyle = $(this).find('.js-slide[data-slick-index="1"]').data('style');
						$(this).attr('data-current-style', currentStyle);
						$(this).removeClass('hero--is-loading');

						// Resizes background image without stretching it
						if ( currentHero.data('image-height') == 'original-height' ){
							self.setSlidesHeight(currentHero);
						}
					});

					currentHero.on('beforeChange', function(event, slick, currentSlide, nextSlide) {
						var activeSlide = parseInt(nextSlide + 1);
						var currentStyle = $(this).find('.js-slide[data-slick-index="' + activeSlide +'"]').data('style');
						$(this).attr('data-current-style', currentStyle);
					});

					currentHero.slick( options );

					$(window).resize(
						Reqs.debounce(function(event){
							self.setSlidesHeight( currentHero );
					}, 250));
				} );

				$('.slick-list').attr('tabindex','-1'); 
					
				scrollDownBtn.on('click', function(e) {
					e.preventDefault();

					var isStandardNav = $(window).width() >= 768 && $('.site-header').hasClass('is-standard');
					var headerHeight = isStandardNav ? 59 : -1;
					var scrollToPosition = parseInt(hero.offset().top + hero.outerHeight() - headerHeight);
					$('html, body').stop(true, false).animate({ 'scrollTop': scrollToPosition }, 500);
				});
			},

			/* Set slides height on Image Height option chosen */
			setSlidesHeight: function(slider){
				var isSlideshow = slider.hasClass('js-hero-slider');
              	var isImageHeight = slider.data( 'image-height' ) == 'original-height';
				var slideWidth = slider.width();
				var currentSlideHeight = isSlideshow ? slider.find('.slick-current img:visible').data( 'aspectratio' ) * slideWidth : slider.find('.slick-current img').data( 'aspectratio' ) * slideWidth;

				if ( isImageHeight && currentSlideHeight ) {
					slider.find('.slick-list').height(currentSlideHeight);
				}

				slider.find('.js-slide').each(function() {
					var hasImage = $(this).find('img').length;

					if (hasImage) {
						var aspectRatio = isSlideshow ? $(this).find('img:visible').data('aspectratio') : $(this).find('img').data('aspectratio');
						var slideWidth = $(this).width();
						var imageHeight = parseInt(slideWidth / aspectRatio);

						$(this).css('height', imageHeight);
					}
						
				});
			},

			/* Carousel Slider
			 * Called multiple times throughout site
			 */
			carousel: function(){
				var $carousel = $( '.js-carousel-slider' );
				var flickity = $carousel.data( 'flickity' );
				if (flickity == undefined) {
					$carousel.flickity({
						cellSelector: '.js-slide',
						cellAlign: 'center',
						watchCSS: true,
						prevNextButtons: false,
						pageDots: false
					});
				}
			},

			/* Collection Slider */
			collection: function(){
				var $container = $( '.js-collection-grid' );
				var $carousel = $( '.js-collection-slider' );

				$carousel.find('.will-animate').removeClass('will-animate');

				$('.quickView-button', $carousel).on('click', function() {
					$(this).closest('.slick-slide').addClass('slick-slide--quickView');
				});

				$('html, body').on('quickView:show', function() {
					setQuickViewPosition();
					$carousel.find('.slick-slide--quickView').removeClass('slick-slide--quickView');
				});

				$('html, body').on('quickView:ajax', setQuickViewPosition);

				$container.each(function() {
					Site.sliders.setCarouselState( $(this) );
				});

				$(window).on( 'resize', Reqs.debounce(function() {
					setQuickViewPosition();
					
					$container.each(function() {
						Site.sliders.setCarouselState( $(this) );
					});
				}, 250));

				function setQuickViewPosition() {
					var $slide = $carousel.find('.slick-slide--quickView');

					if ( !$slide.length ) {
						$slide = $carousel.find('.quickView--is-visible').closest('.slick-slide');
					}

					if ( $carousel.length && $slide.length ) {
						var $quickView = $slide.find('.quickView-wrap');
						var offsetLeft = $carousel.find('.slick-slide.slick-current').position().left - $slide.position().left;

						$quickView.css('left', offsetLeft);
					}
				}

				var item = '.collectionBlock';
				Site.scroller( $carousel, item );
			},

			setCarouselState: function($container) {
				if ( typeof($container) == 'undefined' ) return;

				var $carousel = $container.find( '.js-collection-slider' );

				$carousel.find('.will-animate').removeClass('will-animate');

				$carousel.on( 'init', function() {
					setArrowsPosition();
				} );

				if ( $carousel.length ) {
					var isInitialized = $carousel.hasClass( 'slick-initialized' );
					var slidesPerRow = parseInt( $container.data( 'slides-per-row' ));
					var windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;

					if ( windowWidth >= 768 ) {
						if ( !isInitialized ) {
							$carousel.slick({
								slidesPerRow: slidesPerRow,
								infinite: false,
								dots: false,
								responsive: [
									{
										breakpoint: 1024,
										settings: {
											slidesPerRow: 2
										}
									}
								]
							}).on( 'beforeChange', function() {
								if ( $( '.quickView--is-visible' ).length ) {
									QuickView.hide();
								}
							});
						}
					} else {
						if ( isInitialized ) {
							$carousel.slick( 'unslick' );
						}
					}
				}

				function setArrowsPosition() {
					var $arrows = $carousel.find( '.slick-arrow' );
					var arrowTop = $carousel.find( '.collectionBlock-image' ).outerHeight() / 2;

					$arrows.css( 'top', arrowTop );
				}

				setArrowsPosition();

			},

			/* Gallery Slider */
			gallery: function(){
				var self = this;
				var slider = $('.js-slider');
				var options = {};

				slider.each( function () {
					var currentSlider = $(this);
					options = JSON.parse( $( this ).data( 'slick' ).replace(/'/g, '"') );

					currentSlider.on('init', function() {
						$(this).removeClass('gallery-slider--is-loading');
					});

					if ( currentSlider.data('image-height') == 'original-height' ){
						Site.sliders.setSlidesHeight( currentSlider );
						$(window).resize(
							Reqs.debounce(function(event){
								Site.sliders.setSlidesHeight( currentSlider );
						}, 250));
					}

					currentSlider.slick( options );

					// Pause slider if it's outside the viewport to prevent elements shaking
					$(window).on( 'scroll', 
						Reqs.debounce( function(event) {
							var isSliderVisible = isAnyPartOfElementInViewport(currentSlider.get( 0 ));

							if ( isSliderVisible ) {
								currentSlider.slick( 'slickPlay' );
							} else {
								currentSlider.slick( 'slickPause' );
							}
						}, 150)
					);
				} );

				function isAnyPartOfElementInViewport(el) {

				    const rect = el.getBoundingClientRect();
				    const windowHeight = (window.innerHeight || document.documentElement.clientHeight);
				    const windowWidth = (window.innerWidth || document.documentElement.clientWidth);

				    const vertInView = (rect.top <= windowHeight) && ((rect.top + rect.height) >= 0);
				    const horInView = (rect.left <= windowWidth) && ((rect.left + rect.width) >= 0);

				    return (vertInView && horInView);
				}
			},

			/* Mosaic Slider Mobile */
			mosaic: function(){
				var self = this;
				var slider = $('.js-mosaic__blocks');

				slider.each( function() {
					var currentSlider = $(this);

					self.initMobileSlider(currentSlider);
					$(window).resize(
						Reqs.debounce( function(event) {
						self.initMobileSlider(currentSlider);
					}, 250));
				});

				if ( typeof(Currency) != 'undefined' && Currency ){
				    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
				    onCurrencySet();
				}
			},

			/* Mosaic Slider Mobile */
			testimonials: function(){
				var self = this;
				var slider = $('.js-testimonials__blocks');

				slider.each( function() {
					var currentSlider = $(this);

					self.initMobileSlider(currentSlider);
					$(window).resize(
						Reqs.debounce( function(event) {
						self.initMobileSlider(currentSlider);
					}, 250));
				});
			},

			initMobileSlider: function(currentSlider) {
				var isMobile = $(window).width() < 768;
				var isSlickActive = currentSlider.hasClass('slick-initialized');
				var options = {
					'infinite': true,
					'autoplay': false,
					'speed': 300,
					'slidesToShow': 1,
					'arrows': true,
					'dots': false
				};

				if (currentSlider.hasClass('js-testimonials__blocks')) {
					options = $.extend({}, options, {
						'arrows': false,
						'dots': true
					})
				}
				
				// Init Slick on mobily only and destroy it otherwise
				if (isMobile && !isSlickActive) {
					currentSlider.slick( options );
				} else if (!isMobile && isSlickActive) {
					currentSlider.slick( 'unslick' );
				}
			},

			/* Logos list carousel */
			logosList: function(){
				var self = this;
				var slider = $('.js-logos-slider');
				var options = {
					'infinite': true,
					'autoplay': false,
					'speed': 300,
					'slidesToShow': 8,
					'centerPadding': '80px',
					'arrows': true,
					'dots': false,
					'responsive': [
						{
						  'breakpoint': 1440,
						  'settings': {
							'centerPadding': '40px',
							'slidesToShow': 6
						  }
						},
						{
						  'breakpoint': 1024,
						  'settings': {
							'centerPadding': '30px',
							'slidesToShow': 5
						  }
						},
						{
						  'breakpoint': 992,
						  'settings': {
							'centerPadding': '25px',
							'slidesToShow': 4
						  }
						},
						{
						  'breakpoint': 768,
						  'settings': {
							'centerPadding': '20px',
							'slidesToShow': 3
						  }
						},
						{
						  'breakpoint': 640,
						  'settings': {
							'centerPadding': '15px',
							'slidesToShow': 2
						  }
						},
						{
						  'breakpoint': 375,
						  'settings': {
							'centerPadding': '10px',
							'slidesToShow': 1
						  }
						}
					]
				};
				
				slider.each(function() {
					$( this ).slick( options );
				});
			},

			/* Product Slider - on mobile */
			product: function(){
				var mfpOpen = true;
				var $productImgContainer = $( '[data-section-type="product-template"]' );
				var $productImgSlider = $productImgContainer.find( '.js-productImgSlider' );
				var $productImgSliderNav = $productImgContainer.find( '.js-productImgSlider-nav' );
				var sliderId = '#' + $productImgSlider.attr('id');
				var activeArrows = $productImgSlider.data('arrows');
				var activeDots = $productImgSlider.data('dots');
				var sliderNavArrows = $productImgSliderNav.find('.js-slide').length > 3;
				var activeSlide = $productImgSlider.find('.is-selected-product').index();
				activeSlide = activeSlide == -1 ? 0 : activeSlide;

				if ( $productImgSlider.find('.js-slide').length > 1 ) {

					$productImgSlider.flickity({
						cellSelector: '.js-slide',
						prevNextButtons: activeArrows,
						arrowShape: 'M 69.65625 6.96875 A 3.0003 3.0003 0 0 0 67.875 7.875 L 27.875 47.875 A 3.0003 3.0003 0 0 0 27.875 52.09375 L 67.875 92.09375 A 3.0003 3.0003 0 1 0 72.125 87.875 L 34.25 50 L 72.125 12.09375 A 3.0003 3.0003 0 0 0 69.65625 6.96875 z',
						pageDots: activeDots,
						initialIndex: activeSlide,
						selectedAttraction: 0.08,
						friction: 0.8,
						contain: true,
						adaptiveHeight: true,
						wrapAround: true
					});

					$productImgSlider.on('change.flickity', Site.setBadgePosition);
					$productImgSlider.on( 'dragStart.flickity', function( event, pointer ) {
						mfpOpen = false;
					});
					$productImgSlider.on( 'change.flickity', function( event, pointer ) {
						setTimeout(function() {
							mfpOpen = true;
						}, 10);
					});

					$productImgSliderNav.flickity({
						cellSelector: '.js-slide',
						asNavFor: sliderId,
						initialIndex: activeSlide,
						pageDots: false,
						prevNextButtons: sliderNavArrows,
						arrowShape: 'M 69.65625 6.96875 A 3.0003 3.0003 0 0 0 67.875 7.875 L 27.875 47.875 A 3.0003 3.0003 0 0 0 27.875 52.09375 L 67.875 92.09375 A 3.0003 3.0003 0 1 0 72.125 87.875 L 34.25 50 L 72.125 12.09375 A 3.0003 3.0003 0 0 0 69.65625 6.96875 z',
						contain: true
					});
				}

				Product.setSlidesHeight($productImgSlider);
				$(window).resize(
					Reqs.debounce(function(event){
						Product.setSlidesHeight($productImgSlider)
				}, 250));
				
				if($productImgSlider.data('gallery') == "lightbox") {
					Reqs.lightbox();

					$('.product-image-lightbox').magnificPopup({
						closeMarkup: '<button title="%title%" type="button" class="mfp-close icon-close"></button>',
						type: 'image',
						gallery:{
							enabled: true,
							arrowMarkup: '<button title="%title%" type="button" class="mfp-arrow mfp-arrow-%dir% icon-arrow-%dir%"></button>'
						},
						disableOn: function() {
							return mfpOpen;
						}
					});
				}

				enquire.register("screen and (min-width: 768px)", function() {
					if ($productImgSlider.data('gallery') == "zoom") {
						Reqs.zoom();
						$productImgSlider.find('.product-image[data-zoom-image]').each(function() {
							var $image = $(this);
							$image.zoom({
								duration: 300,
								url: $image.data('zoom-image'),
								target: $image.find('.zoom-container'),
								callback: function() {
									var forceZoomRatio = 1.5;
									var imageWidth = this.width;
									var imageHeight = this.height;
									var imageAspectRatio = $(this).closest('.product-image').data('aspect-ratio');
									var containerWidth = $(this).closest('.product-image').width();
									var containerHeight = $(this).closest('.product-image').height();

									if (imageWidth < containerWidth) {
										$(this).width(containerWidth * forceZoomRatio);
										$(this).height(containerWidth / imageAspectRatio * forceZoomRatio);
									} else if (imageHeight < containerHeight) {
										$(this).width(containerHeight * imageAspectRatio * forceZoomRatio);
										$(this).height(containerHeight * forceZoomRatio);
									}
								},
								onZoomIn: function() {
									$(this).parent().addClass('zoomed');
								},
								onZoomOut: function() {
									$(this).parent().removeClass('zoomed');
								}
							});
						});
					}		            
				});

				enquire.register("screen and (max-width: 767px)", function() {
					if($productImgSlider.data('gallery') == "lightbox") {
						$('.product-image-wrap a').click(function() {
							event.preventDefault();
						});
					}
				});

			},

			/* Product Tabs */
			productTabs: function(){
				var $productTab = $('.js-product-tabs .product-tab');

				// Click the product-tab title to change the tab
				$productTab.on('click', '.product-tab-title', function(){
					$(this).parent('.product-tab').toggleClass('is-active');

					var $productInfo = $('.js-product-info__wrapper');
					var productInfoHeight = $('.product-info__wrapper').outerHeight();
					var productImagesHeight = $('.product-layout-images').outerHeight();

					productInfoHeight > productImagesHeight ? $productInfo.addClass('product-info__wrapper--static') : $productInfo.removeClass('product-info__wrapper--static');

					$(window).trigger('scroll');
				});

				var $socialIcons = $('.socialBar a');
				$socialIcons.on('click', function () {
					var $diamond = $(this).children('.diamond');
					$diamond.addClass('ripple-click');
					setTimeout(function(){
						$diamond.removeClass('ripple-click');
					}, 2000);
				});
			}
		},

		/*
		 * Main Menu
		 */
		nav: {
			getWidth: function() {
				var ww = $(window).outerWidth();

				if(ww >= 1280) {
					return ww / 3;
				} else if(ww >= 768) {
					return ww * 2 / 3;
				} else {
					return ww;
				}
			},
			init: function(){
				$hamburger = $('#hamburger-menu');
				$body = $('body');
				$menuToggle = $('.js-menuToggle');
				$navSocialLink = $('.nav-social-link');

				Site.nav.bindings();
				Site.nav.activeLinks();
			},
			bindings: function(){
				$menuToggle.on('click', function(e){
					e.preventDefault();

					if ($body.hasClass('nav--is-visible')){
						Site.nav.hide();
					} else {
						Site.nav.show();
					}
				});

				$('.nav-standard .menu li:has(a[aria-expanded])').hover(function() {
					$(this).find('a[aria-expanded]').attr('aria-expanded', true);
				}, function() {
					$(this).find('a[aria-expanded]').attr('aria-expanded', false);
				});

				$('.nav-standard .menu-item--meganav').hover(function() {
					$('.site-header').addClass('header--megamenu-visible');
				}, function() {
					$('.site-header').removeClass('header--megamenu-visible');
				});

				$('.bodyWrap').children().first().on('click', function(){
					Site.nav.hide();
				});

				$('.nav-container .has-submenu > a').on('click', function(e){
					e.preventDefault();
					Site.nav.submenu.open( $(this) );
				});

				$('.submenu-back').on('click', function(e){
					e.preventDefault();
					Site.nav.submenu.close( $(this) );
				});

				$('.js-searchToggle').on('click', function(){
					if ($(this).closest('.nav-main').hasClass('search--is-visible')){
						Site.nav.search.close();
						Search.close();
					} else {
						var search = $(this).closest('.nav-main');
						Site.nav.search.open(search);
					}
				});

				// Hide search modal on click outside
				$(document).on('click', function(e){
					if (!$(e.target).is('.nav-search-overlay, .nav-search-overlay *, .js-searchToggle, .js-searchToggle *')) {
						if ($('.nav-main').hasClass('search--is-visible')){
							Site.nav.search.close();
							Search.close();
						}
					}
				});

				$navSocialLink.on('click', function (e) {
					var $diamond = $(this).children('.diamond');
					$diamond.addClass('ripple-click');
					setTimeout(function(){
						$diamond.removeClass('ripple-click');
					},500);
				});

				// Close hamburger menu on body click
				$('body').on('click', function(e) {
					if (!$(e.target).is('.js-menuToggle *, .nav-main *')) {
						Site.nav.hide();
					}
				});
			},
			show: function(){
				$hamburger.addClass('open');

				$('.js-searchToggle').focus();
				$('.js-searchToggle').attr('tabindex','0').attr('aria-expanded', true);;
				$('.last-focusable-element').attr('tabindex','0');

				$body.add('html').addClass('nav--is-visible');

				$('.nav-inner').css({
					'transform': 'translateX(100%)'
				});

				$('.header-fix-cont-inner, .bodyWrap, .siteAlert, .main-logo').css({
					'transform': 'translateX('+$('.nav-inner').width()+'px)'
				});

				$(window).on('resize.siteNav', function() {
					$('.header-fix-cont-inner, .bodyWrap').css({
						'transform': 'translateX('+$('.nav-inner').width()+'px)'
					});
				});

				var activeEl = document.activeElement;
				if($(activeEl).hasClass('js-menuToggle ')){
					$('body').on('keydown', function(e) {
						if(e.which == 9){
							$('.js-searchToggle').focus();
						}
					});
				}

				$('body').on('keydown', function(e) {
					if (e.which == 9) {
						var activeEl = document.activeElement;
						 if($(document.activeElement).hasClass('last-focusable-element')){
							Site.nav.hide();
							$('.last-focusable-element').attr('tabindex','-1');
						 }
					 }
				});

				$('.visible-nav-link').each(function(){
					$(this).removeAttr('tabindex');
				});

				$('body').on('keydown', function(e) {
					var activeEl = document.activeElement;
					var sibling = $(activeEl).next();
					if($(sibling).hasClass('is-visible') && e.which == 9 ){
						$('.submenu-item--link').each(function(){
							$(this).attr('tabindex','0');
						});
					}
					if($(activeEl).data('last') == true && e.which == 9){
						var menu = $(activeEl).parents().eq(3);
						$(menu).removeClass('submenu--is-visible');
						$('.submenu-item--link').each(function(){
							$(this).attr('tabindex','-1');
						});
					}
				});

				$('.js-searchToggle').attr('tabindex','0');
				$('#shopName').attr('tabindex','-1');
				$('#cartTotal').attr('tabindex','-1');

			},
			hide: function(){
				$hamburger.removeClass('open');
				$body.add('html').addClass('nav--is-hiding');

				$('.nav-inner, .header-fix-cont-inner, .bodyWrap, .siteAlert, .main-logo').add($hamburger).css({
					'transform': 'none'
				});

				$(window).off('resize.siteNav');

				setTimeout(function(){
					$body.add('html').removeClass('nav--is-visible');
					$body.add('html').removeClass('nav--is-hiding');
				}, 300);

				// close search too
				if ($('.nav-container').hasClass('search--is-visible')){
					Site.nav.search.close();
					Search.close();
				}

				$('.visible-nav-link').each(function(){
					$(this).attr('tabindex','-1');
				});

				$('.js-searchToggle').removeAttr('tabindex').attr('aria-expanded', false);
				$('#shopName').attr('tabindex','0');
				$('#cartTotal').attr('tabindex','0');

			},

			activeLinks: function(){
				var $menu_items = $(".menu-item"),
						$submenu_items = $('.submenu-item');

				$menu_items.each(function(){
					if ($(this).find('> a').attr('href')=== window.location.pathname) {
						$(this).addClass('is-active');
					}
					// if no top-level link is active, then a submenu link is probably active
					else {
						$submenu_items.each(function(){
							if ($(this).find('> a').attr('href')=== window.location.pathname) {
								$(this).addClass('is-active'); // activate the active submenu link
								$(this).closest('.menu-item.has-submenu').addClass('is-active'); // activate parent as well
							} else {
								return; // must be homepage or page not in menu
							}
						});
					}
				});
			},

			/*
			 * Sub Menus
			 */
			submenu: {
				open: function(el){
					var $menu = $('.menu'),
						menuHeight = $menu.height();
					$menu.addClass('submenu--is-visible');

					var $elSubMenu = el.siblings('.submenu'),
						elSubMenuHeight = $elSubMenu.height();
					$elSubMenu.addClass('is-visible');

					if (menuHeight < elSubMenuHeight) {
						$menu.height(elSubMenuHeight);
					}
					return false;
				},
				close: function(el){
					var link = $(el).children().first(),
						$menu = $('.menu'),
						menuHeight = $menu.height(),
						$elSubMenu = el.closest('.submenu'),
						$elParentMenu = $elSubMenu.parents('.submenu'),
						elParentMenuHeight = $elParentMenu.height();

					if( $(link).hasClass('first-back--link') ){
						$('.menu').removeClass('submenu--is-visible').removeAttr("style");
					}

					$elSubMenu.removeClass('is-visible');

					if (menuHeight < elParentMenuHeight) {
						$menu.height(elParentMenuHeight);
					}

					return false;
				}
			},

			/*
			 * Search
			 */
			search: {
				open: function(search){
					$('.js-searchToggle').attr('aria-expanded', true);
					search.addClass('search--is-visible');
					search.find('.nav-search-input').focus();
				},
				close: function(){
					$('.js-searchToggle').attr('aria-expanded', false);
					$('.nav-main').addClass('search--is-hiding');
					setTimeout(function(){
						$('.nav-main').removeClass('search--is-visible search--is-hiding');
					}, 600);
				}
			}
		},

		images: {
			loadBackgrounds: function() {
				var $elementsToLoad = $('[data-bg-src]').not('.bg-loading, .bg-loaded');

				$elementsToLoad.each(function() {

					var $el = $(this);

					var src = $el.attr('data-bg-src');
					var placeholder = false;

					if(src == '') {
						src = '//cdn.shopify.com/s/files/1/0082/8132/5665/t/2/assets/placeholder-pattern.png?1298';
						placeholder = true;
					}

					$el.addClass('bg-loading').prepend(s.spinner);

					var im = new Image();

					$(im).on('load', function() {

						$el.css('background-image', 'url('+src+')').removeClass('bg-loading').addClass('bg-loaded').find('.spinner').fadeOut(300, function() {
								$(this).remove();
							});

						if(placeholder) {
							$el.addClass('bg-placeholder');
						}

						// ensures image is visible in quickView when as it's opened
						if ($('.quickView').length){
							$('.quickView').find('.quickView-img-inner').addClass('quickView-variant-img--is-active');
						}

					});

					$(im).on('error', function() {
						$el.css('background-image', 'url(//cdn.shopify.com/s/files/1/0082/8132/5665/t/2/assets/placeholder-pattern.png?1298)')
							.removeClass('bg-loading').addClass('bg-placeholder bg-loaded').find('.spinner').fadeOut(300, function() {
								$(this).remove();
							});
					});

					im.src = src;

					if(im.complete) {
						$(im).trigger('load');
					}

				})
			}
		},

		/*
		 * Form Address Validation
		 */
		addresses: {
			addAddressForm: $(".js-addAddress > form"),
			editAddressForm: $(".js-editAddress > form"),
			init: function () {
				$addAddressForm = this.addAddressForm,
				$editAddressForm = this.editAddressForm;

				Site.addresses.validating();
			},
			validating: function () {
				$addAddressForm.add($editAddressForm).submit(function (e) {
					var isEmpty = true;

					// Display notification if input is empty
					$(this).find('input').not(".optional").each(function () {
						if (!$(this).val()) {
							$(this).next().addClass("validation--showup");
						} else {
							$(this).next().removeClass("validation--showup");
						}
					});

					// Detect whether form is valid
					$(this).find('input').not(".optional").each(function () {
						if (!$(this).val()) {
							isEmpty = false;
						}
					});
					if (!isEmpty) {
						return false;
					}
				});
			}
		},
		setBadgePosition: function() {
			var badges = $('.product-status-flag');

			if (badges.length) {
				badges.each(function() {
					var badge = $(this);
					var imgContainer = badge.closest('[data-aspectratio]');
					var imgContainerWidth = imgContainer.outerWidth();
					var imgContainerHeight = imgContainer.outerHeight();
					var imgContainerRatio = parseFloat(imgContainerWidth / imgContainerHeight);
					var imageAspectRatio = parseFloat(imgContainer.data('aspectratio'));
					var diffRatio = imageAspectRatio / imgContainerRatio;
					var posLeft = 0;
					var posTop = 0;

					if ( imageAspectRatio > imgContainerRatio ) {
						posLeft = 0;
						posTop = parseInt( ( imgContainerHeight - imgContainerHeight / diffRatio ) / 2 );
					} else {
						posTop = 0;
						posLeft = parseInt( ( imgContainerWidth - imgContainerWidth * diffRatio)  / 2 );
					}

					badge.css({
						top: posTop,
						left: posLeft,
						opacity: 1
					});
				});
					
			}
		},
		onPriceAdded: function() {
			if( Currency ){
			    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
			    onCurrencySet();
			} 
		},

		checkReviewsApp: function() {
			var checking = setInterval(function() {
				var reviewsAppInstalled = typeof(window.SPR) == 'function';
				
				if (!reviewsAppInstalled) {
					$('body').attr('data-app-reviews', 'not-installed');
				} else {
					$('body').removeAttr('data-app-reviews');
					clearInterval(checking);
				}
			}, 100);

			setTimeout(function() {
				clearInterval(checking);
			}, 15000);
		},

		animations: {
			init: function() {
				var enableAnimations = $( 'body' ).hasClass( 'show-grid-items-transition' );

				if ( enableAnimations ) { 
					this.animateAll();
					$(window).on('scroll', Reqs.throttle(this.animateAll, 100));
					$(window).on('load', this.animateAll);
					$(document).on('ajaxify:updated', this.animateAll);
				}
			},

			animateAll: function() {
				var animatedElements = $('.will-animate');
				animatedElements.each(function() {
					var animationClass = 'animated ' + $(this).data('animation');
					if ($(this).visible(true)) {
						$(this).addClass(animationClass).removeClass('will-animate');
					}
				});
			}
		},

		checkBanner: function() {
			var siteHeader = $( '.site-header' );
			var forceHeaderStyle = $( '.banner[data-header-style="index"]' ).length;
			var isAboutTemplate = $( '[data-section-type="about-template"]' ).length;

			if ( isAboutTemplate ) {
				if (forceHeaderStyle) {
					siteHeader.addClass( 'template-index' );
				} else {
					siteHeader.removeClass( 'template-index' );
				}
			} 
		},

		scroller: function( container, item ) {
			container.on( 'scroll', Reqs.throttle(function() {
				var $items = $(this).find( item );
				$items.each( function() {
					var $item = $(this);
					var itemWidth = $item.outerWidth();
					var windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
					var itemLeft = $item.position().left;

					if ( itemLeft >= -itemWidth / 2 && itemLeft + windowWidth / 2 < windowWidth ) {
						$item.addClass( 'is-visible' ).siblings().removeClass( 'is-visible' );
					}
				});
			}, 10)).trigger('scroll');

			$(window).on( 'resize' , Reqs.debounce( function() {
				container.trigger('scroll');
			}, 100));
		}
	}

	var popoverTimer,
	Cart = {
		init: function(){
			var $cart = $('#Cart');

			this.counter();

			$('.js-cartToggle').on('click', function(e){
				var $this = $(this);

				if ($(window).width() > 768) {
					e.preventDefault();
					var bodyWidth = $( 'body' ).width();

					Site.setCartClosePosition();

					$body.toggleClass('cart--is-visible');
					if ($body.hasClass('cart--is-visible')) {
						$body.css('width', bodyWidth);
						$cart.removeClass('close');
						$cart.addClass('open');
						$('#cartTotal').attr('aria-expanded', true);
					} else {
						$cart.removeClass('open');
						$cart.addClass('close');
						$('#cartTotal').attr('aria-expanded', false);
						$body.css('width', 'auto');
					}
					$('.js-continueShopping').attr('tabindex','0');
				} else {
					if ($this.hasClass('js-cartToggle-close')) {
						e.preventDefault();
						$('html').css('overflow','initial');
						$body.removeClass('cart--is-visible');
						$body.css('width', 'auto');
						$cart.removeClass('open');
						$cart.addClass('close');
						$('#cartTotal').attr('aria-expanded', false);
					}
					$('.js-continueShopping').attr('tabindex','-1');

				}
			});

			$('body').on('click', '.js-productForm-submit', function(e) {
			var $form = $(this).closest('form.productForm');

			if ($form.find('[type="file"]').length) return;

			e.preventDefault();

				Cart.submit($(this));
			});

			/* Continue Shopping link - hide cart overlay if on desktop */
			if ( ($(window).width() > 768) && !(window.location.href.indexOf('/cart') > -1) ){
				$('.js-continueShopping').on('click', function(e){
					e.preventDefault();
					$('.js-cartToggle').trigger('click');
				});
			}
		},
		submit: function(el) {
			var $form = el.closest('form.productForm'),
				product_handle = el.attr("data-handle"),
				variant_id = $form.find('select[name="id"] option:selected').attr('value'),
				quantity = $form.find('.inputCounter').prop('value') || $form.find('#quantity').prop('value'),
				form_array = $form.serializeArray();

			var form_data = {};

			$.map(form_array, function(val, i){
			  form_data[val.name] = val.value;
			});

			$.ajax({
				method: 'POST',
				url: '/cart/add.js',
				dataType: 'json',
				data: form_data,
				success: function(product){
					el.html("Added!");
					setTimeout(function(){
						el.html("Add To Cart");
					}, 1000);

					Cart.getCart(Cart.buildCart);

					if ($(window).width() > 550){
						Cart.popover.show(product);
					}
				},
				// If there are no products in the inventory
				error: function(data){
					$.ajax({
						method: 'GET',
						url: '/products/'+product_handle+'.js',
						dataType: 'json',
						success: function(product){
							var variants = product.variants,
									// variants is an array [0{},1{},2{}...]
									variant = $.each(variants, function(i, val){
										// val returns the contents of 0,1,2
										if (val.id == variant_id) {
											return variant_quantity = val.inventory_quantity; // set variant_quantity variable
										}
									}),
									$popover = $('#CartPopoverCont'), // same popover container used to show succesful cart/add.js
									error_details = "Sorry, looks like we don\u0026#39;t have enough of this product. Please try adding fewer items to your cart.", // translation string
									tag = new RegExp('\[\[i\]\]'), // checks for [[i]]
									error = error_details; // set error to just default to error_details

							if (tag.test(error_details) == true){
								// [[i]] is part of the trans string, this can be whatever,
								// but in the tutorial we use [[i]] so leave it
								error = error_details.replace('[[i]]', variant_quantity); // re-set error with new string
							}

							el.html("WOOPS!"); // swap button text
							setTimeout(function(){
								el.html("Add To Cart"); // swap it back
							}, 1000);

							// clear popover timer, set at top of Cart object
							clearTimeout(popoverTimer);

							// empty popover, add error (with inventory), show it, remove click events so it doesn't open cart
							$popover.empty().append('<div class="popover-error">'+error+'</div>').addClass('is-visible').css({'pointer-events': 'none'});
							// set new instance of popoverTimer
							popoverTimer = setTimeout(function(){
								$popover.removeClass('is-visible').css({'pointer-events': 'auto'});
							}, 5000);
						},
						error: function(){
							console.log("Error: product is out of stock. If you're seeing this, Cart.submit.error() must have failed.");
						}
					});
				}
			});
		},
		popover: {
			show: function(product){
				var $popover = $('#CartPopoverCont'),
					item = {},
					source = $('#CartPopover').html(),
					template = Handlebars.compile(source);

				item = {
					item_count: product.quantity,
					img: product.image,
					name: function(){
						name = product.product_title;

						if (name.length > 20){
							name = name.substring(0, 20) + ' ...';
						}

						return name;
					},
					variation: product.variant_title == 'Default Title' ? false : product.variant_title,
					price: product.price,
					price_formatted: Shopify.formatMoney(product.price)
				}

				$popover.empty().append(template(item));

				// clear popover timer, set at top of Cart object
				clearTimeout(popoverTimer);

				$popover.addClass('is-visible');

				Site.images.loadBackgrounds();

				// set new instace of popoverTimer
				popoverTimer = setTimeout(function(){
					Cart.popover.hide($popover);
				}, 5000);
			},
			hide: function(el){
				el.removeClass('is-visible');
				setTimeout(function(){
					el.empty();
				}, 300);
			}
		},
		getCart: function(callback) {
		  $.getJSON('/cart.js', function (cart, textStatus) {
			if ((typeof callback) === 'function') {
			  callback(cart);
			}
			else {
			  // ShopifyAPI.onCartUpdate(cart);
			}
		  });
		},
		buildCart: function (cart) {
			var $cart = $('#Cart');
			// Start with a fresh cart div
			$cart.empty();

			// Show empty cart
			if (cart.item_count === 0) {
				$cart.append('<p>' + "It appears that your cart is currently empty!" + '</p>');
				return;
			}

			// Handlebars.js cart layout
			var items = [],
				item = {},
				data = {},
				source = $("#CartTemplate").html(),
				template = Handlebars.compile(source);

			// Add each item to our handlebars.js data
			$.each(cart.items, function(index, cartItem) {
				var itemAdd = cartItem.quantity + 1,
					itemMinus = cartItem.quantity - 1,
					itemQty = cartItem.quantity,
					itemVariantId = cartItem.variant_id;

				/* Hack to get product image thumbnail
				*   - If image is not null
				*     - Remove file extension, add _small, and re-add extension
				*     - Create server relative link
				*   - A hard-coded url of no-image
				*/

				if (cartItem.image != null){
					var prodImg = cartItem.image.replace(/(\.[^.]*)$/, "_small$1").replace('http:', '');
				} else {
					var prodImg = "//cdn.shopify.com/s/assets/admin/no-image-medium-cc9732cb976dd349a0df1d39816fbcc7.gif";
				}

				var prodName = cartItem.product_title,
					prodVariation = cartItem.variant_title;

				if (prodVariation == 'Default Title') {
					prodVariation = false;
				}

				// Create item's data object and add to 'items' array
				item = {
					id: cartItem.variant_id,
					url: cartItem.url,
					img: prodImg,
					name: prodName,
					variation: prodVariation,
					itemAdd: itemAdd,
					itemMinus: itemMinus,
					itemQty: itemQty,
					itemVariantId: itemVariantId,
		  			properties: cartItem.properties,
					price: cartItem.price,
					price_formatted: Shopify.formatMoney(cartItem.price),
					line_price_formatted: Shopify.formatMoney(cartItem.line_price),
					vendor: cartItem.vendor
				};

				items.push(item);
			});

			// Gather all cart data and add to DOM
			data = {
				item_count: cart.item_count,
				items: items,
				note: cart.note,
				totalPrice: Shopify.formatMoney(cart.total_price)
			}

			// update cart slide-out with new cart
			$cart.append(template(data));

			// update cartToggle with new # of items
			$('#CartToggleItemCount').empty().html(cart.item_count);

			Site.images.loadBackgrounds();

			/**
			 * Re-init the ajax cart buttons.
			 * These are added to the handlebars template, but this
			 * js needs to fire to show them after the new
			 * cart is built and inserted.
			 * @see https://help.shopify.com/themes/customization/cart/add-more-checkout-buttons-to-cart-page
			 */
			if (window.Shopify && Shopify.StorefrontExpressButtons) {
				Shopify.StorefrontExpressButtons.initialize();
			}
		},
		/*
		 * Form Counter
		 */
		counter: function(){
			var self = this,
				$cart = $('#Cart');			

			$cart.on( 'blur', '.inputCounter', function() {
				var el = $(this),
					value = $(this).val();

				self.inputCounter( el, value );
			});

			$cart.on('click', '.inputCounter-down', function(){
				var el = $(this),
					$input = el.siblings( '.inputCounter' ),
					value = parseInt( $input.val() ) - 1;

				self.inputCounter(el, value);
			}).on('click', '.inputCounter-up', function(){
				var el = $(this),
					$input = el.siblings( '.inputCounter' ),
					value = parseInt( $input.val() ) + 1;

				self.inputCounter(el, value);
			});

			/* Remove line item on x click */
			$cart.on( 'click', '.cart-product-remove', function() {
				var el = $(this);

				self.inputCounter(el, 0);
			});
		},

		// Product/Quick View Product Submit Form
		inputCounter: function( el, value ) {
			var self = this,
				$cart = $( '#Cart' ),
				$input = el.closest( '.line-item' ).find( '.inputCounter' );

			// Set quantity to 0 and remove the item
			if ( value == 0 ) {
				$input.closest( '.line-item' ).fadeOut( function() {
					$( this ).remove();
				} );

			// Prevent a negative quantity
			} else if (value < 0) {
				value = 0;
			}

			var qty = value;
			var id = $input.attr( 'id' );
			var product_id = id.substring( parseInt( id.indexOf( '_' ) + 1 ) );

			$.ajax( {
				type: 'post',
				url: '/cart/change.js',
				dataType: 'json',
				data: {
					'quantity': qty,
					'id': product_id
				},
				success: function( data ) {
					// Set the updated line item new price
					for ( var i = 0; i < data.items.length; i++ ) {
						var currentItem = data.items[i];
						var $lineItem = $cart.find( '.line-item[data-variant-id="' + currentItem.variant_id + '"]' ).closest( '.line-item' );

						$lineItem.find( '.inputCounter' ).prop( 'value', currentItem.quantity );
						$lineItem.find( '.cart-product-total' ).html( Shopify.formatMoney( currentItem.line_price ) );
					}

					// Set the new total price
					$cart.find( '.cart-total-price' ).html( Shopify.formatMoney( data.total_price ) );

					// Update cart total
					self.updateCartTotal();
				}
			});

			// remove line item if the quantity is 0
			if ( qty == 0 ) {
				$( this ).closest( '.line-item' ).fadeOut( function() {
					$( this ).remove();
					self.updateCartTotal();
				} );
			}
		},
		updateCartTotal: function() {
			$.getJSON('/cart.js', function(cart) {
      			$( '#CartToggleItemCount, #CartItemCount' ).html( cart.item_count );
      		});
		}
	};

	var Collection = {
		init: function() {
			var self = this;
			var tagFilter = document.getElementById( 'tagFilter' ) || false;
			var collectionFilter = document.getElementById( 'collectionFilter' ) || false;

			if( tagFilter ) {
				tagFilter.addEventListener( 'change', function() {
					document.location.href = this.options[ this.selectedIndex ].value;
				});
			}

			if( collectionFilter ) {
				collectionFilter.addEventListener( 'change', function() {
					document.location.href = '?sort_by=' + this.options[ this.selectedIndex ].value;
				} );
			}

			ajaxify();

			$(window)
				.on('load', function() {
					Site.setBadgePosition();
				})
				.on('resize', Reqs.debounce(function() {
					Site.setBadgePosition();
				}, 250));

			$(document).on('ajaxify:updated', function() {
				Site.setBadgePosition();
				if ( typeof(Currency) != 'undefined' && Currency ){
				    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
				    onCurrencySet();
				} 
			});
		},

		/**
		 * Sort collection using the dropdown
		 */
		initSort: function(){
			var	url = window.location.href,
				url_split = url.split('?sort_by='),
				active_filter = url_split[1],

				$selector = $('#collectionFilter'),
				$selected = $selector.find('option[value="'+active_filter+'"]');

			$selected.attr('selected', true);

			$selector.on('click', function() {
				if($selector.hasClass('loading')) {
					event.preventDefault();
				}
			});

			$selector.bind('change', function(event) {
				$selector.addClass('loading');
				$('body').addClass('ajax-sorting');

				var delay = Modernizr.csstransitions ? 200 : 0;

				setTimeout(function() {
					var filter = $selector.val();
					var url = window.location.href;
					var urlBase = url.split('?sort_by=')[0];

					var filterUrl = (filter === '') ? urlBase : urlBase+'?sort_by='+filter;

					if(Modernizr.history) {
						history.replaceState({}, $('title').text(), filterUrl);
						this.ajaxSort(filterUrl);
					} else {
						window.location = filterUrl;
					}
				}.bind(this), delay);
			}.bind(this));
		},

		ajaxSort: function(url) {
			var $loadMoreIcon = $('.collectionGrid-load.load-more-icon');

			$loadMoreIcon.show();
			$('.js-collectionGrid').hide().next('.row').hide();

			$.ajax({
				type: 'GET',
				dataType: "html",
				url: url,
				success: function(data) {
					var products = $(data).find('.js-collectionGrid')[0].outerHTML;
					var nextPage = $(data).find('.js-collectionGrid').next('.row')[0] ? $(data).find('.js-collectionGrid').next('.row')[0].outerHTML : '';

					$('.js-collectionGrid').replaceWith(products);
					$('.js-collectionGrid').next('.row').replaceWith(nextPage);
					$loadMoreIcon.hide();

					$('#collectionFilter').removeClass('loading');
					$('body').removeClass('ajax-sorting');

					Site.images.loadBackgrounds();
				}
			});
		},

		/*
		 * AJAX call to load more products
		 */
		initLoadMore: function() {
			$('body').on('click', '.js-loadMore:not(.loading)', function(event) {

				// hide open quickViews
				QuickView.hide();

				var $el = $(event.target);
				var url = $el.attr('href');

				event.preventDefault();

				$el.addClass('loading');

				// load products
				this.ajaxLoadMore(url);

			}.bind(this));
		},

		ajaxLoadMore: function(url) {
			$.ajax({
				type: 'GET',
				dataType: "html",
				url: url,
				success: function(data) {
					var products = $(data).find('.js-collectionGrid').html(),
						nextPage = $(data).find('.js-loadMore').attr('href');

					$('.js-collectionGrid').find('.gridSpacer').remove();

					$(products).appendTo('.js-collectionGrid');

					if ( typeof(nextPage) !== 'undefined' ){
						$('.js-loadMore').attr('href', nextPage).removeClass('loading');
					} else {
						$('.js-loadMore').remove();
					}

					Site.images.loadBackgrounds();
					collectionBlocks = $('.js-collectionBlock');
				}
			});
		}
	}

	var ListCollections = {
		init: function() {
			var collectionList = $('.js-collection-grid');
				
			$(window)
				.on('load', function() {
					ListCollections.truncateBlockText(collectionList);
				})
				.on('resize', Reqs.throttle(function() {
					ListCollections.truncateBlockText(collectionList);
			}, 50));

			$(document).on('ajaxify:updated', function() {
				ListCollections.truncateBlockText(collectionList);
			});
		},

		truncateBlockText: function(collectionList) {
			collectionList.find('.collectionBlock-info h4').trunk8({
				lines: 3
			});

			collectionList.find('.collectionBlock-info h2').trunk8({
				lines: 2
			});

			collectionList.find('.collectionBlock').removeClass('is-loading');
		}
	}


	/*
	 * quickView AJAX methods
	 *
	 * Key:
	 * * el = ELEMENT attached to, one or more .js-collectionBlock
	 * * handle = product HANDLE, delivered from the front-end  attached to .js-quickView
	 * * obj = product OBJECT, in JSON
	 */
	var QuickView = {

		// global settings
		collectionBlocks: $('.js-collectionBlock'),
		isQuickViewLoading: false,

		init: function(){

			// init global settings
			collectionBlocks = this.collectionBlocks;
			enableColorSwatches = $('.js-collectionGrid').data('color_swatches');
			enableReviews = $('.js-collectionGrid').data('show_reviews');
			showQuantity = $('.js-collectionGrid').data('show_quantity');
			isQuickViewLoading = this.isQuickViewLoading;

			/*
			 * Bind .js-quickView
			 */
			$('.js-collectionGrid').on('click', '.js-quickView', function(e){
				e.preventDefault();

				var isCloseBtn = $(this).hasClass('quickView-close');

				if (isCloseBtn) {
					QuickView.hide();
				} else {
					if (!isQuickViewLoading) {
							isQuickViewLoading = true;

						var $this = $(this), // the .js-quickView button
							product_handle = $this.attr('data-handle'), // [data-handle=""] on the .js-quickView button
							$collectionBlock = $this.closest('.js-collectionBlock'); // the .collectionBlock that contains the product js-quickView

						// if loaded and visible
						if ($collectionBlock.hasClass('is-loaded') && $collectionBlock.hasClass('quickView--is-visible')) {
							QuickView.hide();
						}

						// if loaded but not visible, no other quickViews open
						else if ($collectionBlock.hasClass('is-loaded') && !$collectionBlock.hasClass('quickView--is-visible') && !$('.quickView--is-visible').length) {
							QuickView.show($collectionBlock);
							ColorSwatches.bind($collectionBlock);
						}

						// if loaded and not visible, other quickViews are open
						else if ($collectionBlock.hasClass('is-loaded') && !$collectionBlock.hasClass('quickView--is-visible') && $('.quickView--is-visible').length) {
							QuickView.hide();
							setTimeout(function(){
								QuickView.show($collectionBlock);
							}, 100);
						}

						// if not loaded yet, other quickViews open
						else if ($('.quickView--is-visible').length) {
							QuickView.hide();
							setTimeout(function(){
								QuickView.ajax($collectionBlock, product_handle);
							}, 100);
						}

						// if not loaded yet, no other quickViews open
						else {
							QuickView.hide();
							QuickView.ajax($collectionBlock, product_handle);
						}
					}
				}
			});
		},

		show: function(el){
			var $el = el,
				sub = ($(window).height() - 600)/2,
				offset = el.children('.quickView').offset().top,
				scroll = offset - sub;

			$el.addClass('quickView--is-active');

			$('html, body').animate({scrollTop: scroll}, function(){
				if ($el.hasClass('is-loaded')) {
					$el.addClass('quickView--is-visible');
				} else {
					$el.addClass('quickView--is-visible is-loaded');

					if (enableColorSwatches) {
						ColorSwatches.bind(el);
					}
				}
				// $el.find('.single-option-selector').eq(0).change();
				isQuickViewLoading = false;

				if ( typeof(Currency) != 'undefined' && Currency ){
				    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
				    onCurrencySet();
				} 
			});

			$('html, body').trigger('quickView:show');
		},

		hide: function(){
			collectionBlocks = $('.js-collectionBlock');
			if (collectionBlocks.hasClass('quickView--is-visible')) {
				collectionBlocks.removeClass('quickView--is-visible quickView--is-active');
				$('html, body').trigger('quickView:hide');
				isQuickViewLoading = false;

				if (enableColorSwatches) {
					ColorSwatches.unbind(collectionBlocks);
				}
			}
		},

		ajax: function(el, handle){
			var $collectionBlock = el,
				product_handle = handle,
				reviews = '',
				swatches = '',
				colors = '',
				productBlockSwatchesClass = '',
				quantitySelect = '';

			$.getJSON(
				'/products/'+product_handle+'.js',

				function(product) {
					var id = product.id, // int
						title = product.title, // string
						url = product.url, // string
						options = product.options, // array
						variants = product.variants, // array
						product_images = $('.quickview-product-images[data-handle="' + handle + '"]').html(); // array of strings
						price = product.price,
						compare_at_price = product.compare_at_price,
						compare_at_price_formatted = Shopify.formatMoney(compare_at_price),
						price_formatted = Shopify.formatMoney(price); // string

					self.ajaxed = true; // set ajaxed variable to true, means that ajax has occurred

					/*
					 * Adding the variant dropdown. This contains ALL variants.
					 * option_selection.js then hooks in, hides this dropdown, and generates
					 * however many dropdowns there are (1, 2, or 3)
					 *
					 * Basic template for this at https://docs.shopify.com/support/your-website/themes/can-i-make-my-theme-use-products-with-multiple-options
					 */
					var variant_avail = false,
						first_avail_variant = '';

					var dropdowns = ''; // declare option dropdowns variable
					// loop over product.options
					for ( i = 0; i < options.length; i++ ) {
						dropdowns += '<select class="js-product-select" id="quickview-product-'+[product['id']]+'-select" name="id">'; // I need a separate id bc each product has a quickView -> has a select
						// loop over product.variants
						for(i = 0; i < variants.length; i++){
							if (variants[i]['available'] == true && variant_avail == false){
								selected = 'selected';
								variant_avail = true;
								first_avail_variant = variants[i]['id'];
							} else {
								selected = '';
							}
							dropdowns += '<option value="' + variants[i]['id'] + '"' + selected + '>' + variants[i]['title'] + '</option>';
						}
						dropdowns += '</select>';
					}

					var pricing = '';
					if ( compare_at_price > price ) {
						pricing += '<div class="sale">';
						pricing += '<strike class="product-compare-price">'+compare_at_price_formatted+'</strike>&nbsp;';
						pricing += '<span class="product-sale-price">'+price_formatted+'</span>';
						pricing += '</div>';
					} else {
						pricing += '<div class="product-normal-price">'+price_formatted+'</div>';
					}

					if ( enableColorSwatches ) {
						productBlockSwatchesClass = 'productForm-block--swatches';
						swatches = $collectionBlock.find( '.swatches-fake' ).html();

						// remove fake div after duplicate its html
						$collectionBlock.find( '.swatches-fake input' ).remove();
					}

					if ( enableReviews ) {
						reviews = $collectionBlock.find( '.reviews-fake' ).html();

						// remove fake div after duplicate its html
						$collectionBlock.find( '.reviews-fake' ).remove();
					}

					if ( showQuantity ) {
						quantitySelect = '<div class="productForm-select"><label for="quantity">' + 'QTY' + '</label><select name="quantity" id="quantity">';
                        for ( var i = 1; i <= 9; i++ ) {
                          quantitySelect += '<option value="' + i + '">' + i + '</option>';
                        }
                        quantitySelect += '</select><span class="selectArrow"></span></div>'
					}

					// append data to .js-collectionBlock
					$collectionBlock.append(
						'<div class="quickView">' +
							'<div class="quickView-wrap">' +
								'<div class="container">' +
									'<div class="row inline">' +
										'<div class="quickView-img block s12 xl_s12">' +
											product_images +
										'</div>' +
										'<div class="quickView-info block s12 xl_s12">' +
											'<div class="icon-close quickView-close js-quickView"></div>' +
											'<form class="productForm" action="/cart/add" method="post" data-color_swatches="' + enableColorSwatches + '" data-product_id="' + id + '">' +
												'<h1><a class="js-productUrl" href="' + url + '">' + title + '</a></h1>' +
												'<span class="product-price" data-price="' + price + '">' +
													pricing +
												'</span>' +
												reviews +
												'<div class="productForm-block ' + productBlockSwatchesClass + '">' +
													dropdowns +
													swatches +
												'</div>' +
												'<div class="productForm-block">' +
													quantitySelect +
													'<div><button class="js-productForm-submit productForm-submit" type="submit" name="checkout" data-handle="' + product_handle + '">' + "Add To Cart" + '</button></div>' +
												'</div>' +
											'</form>' +
										'</div>' +
									'</div>' +
								'</div>' +
							'</div>' +
						'</div>'
					); // end append

					// hook into option_selection.js remotely
					QuickView.selectOptions($collectionBlock, product);

					Site.images.loadBackgrounds();

					$('html, body').trigger('quickView:ajax');

				} // end function(product){}
			); // end $.getJSON
		},

		/*
		 * Hook into Shopify's option_select.js remotely
		 * @param el = closest .js-collectionBlock
		 */
		selectOptions: function(el, obj){
			var select = 'quickview-product-'+obj['id']+'-select',
				current_product = 'product_'+obj['id'];

			//Initialize the product array
			var product_obj = [];

			el.closest('.js-collectionGrid').find('.product-json').each(function() {
				var data = JSON.parse($(this).html());
				var id = data.id;
				var key = 'product_'+id;
				product_obj[key] = data;
			});

			/*
			 * OptionsSelectors instantiates the chain of functions within option_selection.js that builds the options selectors.
			 * Docs here: https://docs.shopify.com/support/your-website/themes/can-i-make-my-theme-use-products-with-multiple-options
			 */
			new Shopify.OptionSelectors(select, {
				product: product_obj[current_product], // this is the null from the front-end
				onVariantSelected: selectCallback
			});

			function selectCallback(variant, selector) {
				callback({
					money_format: "",
					variant: variant,
					selector: selector
				});

				var enableColorSwatches = el.closest('.js-collectionGrid').data('color_swatches');
				if (enableColorSwatches) {
					ColorSwatches.init(variant, selector);	
				}
				
			}

			function callback(options){
				var moneyFormat = options.money_format,
					variant = options.variant,
					selector = options.selector;

				var $submit = el.find('.js-productForm-submit'),
					$price = el.find('.product-price'),
					$normal_price = el.find('.product-normal-price'),
					$sale_price = el.find('.product-sale-price'),
					$compare_price = el.find('.product-compare-price'),
					$counter = el.find('.js-counter').not('.cart-product-quantity .js-counter'),
					$sale_container = $price.find('.sale');

				if (variant) {
					if (variant.available) {
						$submit.removeClass('is-disabled').prop('disabled', false).html("Add To Cart");
						$counter.css({'opacity': 1, 'pointer-events': 'auto'});
						$price.css({'opacity': 1});

						$price.attr('data-price', variant.price);
						$normal_price.html(Shopify.formatMoney(variant.price, moneyFormat));

						if (variant.compare_at_price != null){
							if (variant.compare_at_price > variant.price) {
								if ($sale_container.length){
									$compare_price.html(Shopify.formatMoney(variant.compare_at_price, moneyFormat));
									$sale_price.html(Shopify.formatMoney(variant.price, moneyFormat));
								} else {
									$price.append('<div class="sale" itemprop="price"><strike class="product-compare-price"></strike>&nbsp;<span class="product-sale-price"></span></div>');
									$('.product-compare-price').html(Shopify.formatMoney(variant.compare_at_price, moneyFormat));
									$('.product-sale-price').html(Shopify.formatMoney(variant.price, moneyFormat));
								}
								$normal_price.hide();
								$sale_container.show();
							} else if (variant.compare_at_price <= variant.price) {
								if($normal_price.length) {
									$normal_price.html(Shopify.formatMoney(variant.price, moneyFormat));
								} else {
									$price.append('<div class="product-normal-price" itemprop="price">'+Shopify.formatMoney(variant.price, moneyFormat)+'</div>');
								}
								$sale_container.hide();
								$normal_price.show();
							}
							$submit.attr( 'disabled', false );
						} else {
							$sale_container.hide();
							$normal_price.show();
						}
					}
					// this variant sold out
					else {
						$submit.addClass('is-disabled').prop('disabled', true).html("Sold Out");
						$counter.css({'opacity': 0.3, 'pointer-events': 'none'});
						$price.css({'opacity': 0.3});
						$price.attr('data-price', variant.price);
						$normal_price.html(Shopify.formatMoney(variant.price, moneyFormat));

						if (variant.compare_at_price != null){
							if (variant.compare_at_price > variant.price) {
								if ($sale_container.length){
									$compare_price.html(Shopify.formatMoney(variant.compare_at_price, moneyFormat));
									$sale_price.html(Shopify.formatMoney(variant.price, moneyFormat));
								} else {
									$price.append('<div class="sale" itemprop="price"><strike class="product-compare-price"></strike>&nbsp;<span class="product-sale-price"></span></div>');
									$('.product-compare-price').html(Shopify.formatMoney(variant.compare_at_price, moneyFormat));
									$('.product-sale-price').html(Shopify.formatMoney(variant.price, moneyFormat));
								}
								$normal_price.hide();
								$sale_container.show();
							} else if (variant.compare_at_price <= variant.price) {
								if($normal_price.length) {
									$normal_price.html(Shopify.formatMoney(variant.price, moneyFormat));
								} else {
									$price.append('<div class="product-normal-price" itemprop="price">'+Shopify.formatMoney(variant.price, moneyFormat)+'</div>');
								}
								$sale_container.hide();
								$normal_price.show();
							}
						} else {
							$sale_container.hide();
							$normal_price.show();
						}
					}

					// this will swap images in the quickView
					Product.showVariantImage(variant, el);
				} else {
					$submit.addClass('is-disabled').prop('disabled', true).html("UNAVAILABLE");
					$counter.css({'opacity': .3, 'pointer-events': 'none'});
					$price.css({'opacity': 0.3});
				}
			}

			/*
			 * option_selection.js doesn't add a label if there's only one option,
			 * so this logic:
			 * * adds a label (and arrow) if there's only one option and multiple variants
			 * * prepends the arrow if there are more than one option (this is a normal successful call to option_selection.js)
			 * * hides the select element and wrapper if there is only one variant
			 */

			if (obj['options'].length === 1 && obj['variants'].length){
				if (obj['variants'][0].title === 'Default Title') {
					for (i = 0; i < obj['options'].length; i++) {
						$('#'+select+'-option-'+[i]).closest('.productForm-block').hide();
					}
				} else {
					for (i = 0; i < obj['options'].length; i++) {
						$('#'+select+'-option-'+[i]).closest('.selector-wrapper').attr('data-id', 'product-select-option-'+[i]).prepend('<span class="selectArrow"></span><label>'+obj['options'][0]['name']+'</label>');
					}
				}
			} else if (obj['options'].length > 1){
				for (i = 0; i < obj['options'].length; i++) {
					$('#'+select+'-option-'+[i]).closest('.selector-wrapper').attr('data-id', 'product-select-option-'+[i]).prepend('<span class="selectArrow"></span>');
				}
			}

			QuickView.show(el)
		} // end selectOptions
	} // end QuickView

	Site.init();
	Cart.init();
	Collection.init();
	ListCollections.init();
	QuickView.init();
	Blog.init();
	Insta.init();
	$(document).ready(function() {
		Gmap.init();

		$(window).trigger('scroll');
	});
	
	Sections.init();
	Popup.init();
	Search.init();

	

	if ( $('.template-product').length ) {
		Product.init();
	}

	if ( $('[data-section-type="featured-product"]').length ) {
		FeaturedProduct.init();
	}

	if ( $('.template-password').length ) {
		Password.init();
	}
});
// end .ready()

var Product = {
	init: function( update ){
		var update = (typeof update !== 'undefined') ?  update : false;
		var isScrollerSelected = $('.product-layout--scrollable').length;

		// if( !update ) Cart.counter();

		this.productImages();
		this.variantsInit();

		if ( isScrollerSelected ) {
			this.initScroller();
		}

		var label = $('.selector-wrapper').find('label');
		var labelHeight = $(label).outerHeight();
		var boxHeight = $('.single-option-selector').outerHeight();
		var arrowHeight = $('.selectArrow').outerHeight();
		var offset = labelHeight + boxHeight - arrowHeight;

		if ($('#add-to-cart-bar').length) {
			this.shopBar();
		}
	},

	variantsInit: function() {
		/**
		 * Initialize variants dropdown.
		 */
		var container = $( '.js-product-template' );
		var enableColorSwatches = container.find('.productForm').data('color_swatches');
		var productJSON = $('#product-json').text();
		var product = JSON.parse(productJSON);
		new Shopify.OptionSelectors('product-select', {
			product: product,
			onVariantSelected: Product.selectCallback
		});

		manageOptions( product );

		function manageOptions( obj ){
		  if (obj['options'].length === 1 && obj['variants'].length){
			if (obj['variants'][0].title === 'Default Title') {
			  for (i = 0; i < obj['options'].length; i++) {
				$('#product-select-option-'+[i]).closest('.productForm-block').hide();
			  }
			} else {
			  for (i = 0; i < obj['options'].length; i++) {
				$('#product-select-option-'+[i]).closest('.selector-wrapper').attr('data-id', 'product-select-option-'+[i]).prepend('<span class="selectArrow"></span><label>'+obj['options'][0]+'</label>');
			  }
			}
		  } else if (obj['options'].length > 1){
			for (i = 0; i < obj['options'].length; i++) {
			  $('#product-select-option-'+[i]).closest('.selector-wrapper').attr('data-id', 'product-select-option-'+[i]).prepend('<span class="selectArrow"></span>');
			}
		  }
		}

		if (enableColorSwatches) {
			ColorSwatches.bind(container);
		}
	},

	initScroller: function() {
		var self = this;
		var productImages = $('.product-image').length;
		var $mobileSlider;

		if (productImages > 1) {
			var isPageLoaded = false;
			var $row = $('.js-row--scrollable');
			var $productImg = $('.product-image');
			var $productImgScroller = $('.js-productImgScroller');
			var $productImgNav = $('.js-productImgScroller-nav');
			var $productInfo = $('.js-product-info__wrapper');
				
			$(window).on('scroll', 
				Reqs.throttle(function(event){
					var windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;

					if (windowWidth >= 1024) {
						var scrolled = $(this).scrollTop();
						var rowHeight = $row.outerHeight();
						var headerHeight = 60;
						var productImgScrollerHeight = $productImgScroller.outerHeight();
						var productImgNavHeight = $productImgNav.outerHeight();
						var productInfoHeight = $productInfo.outerHeight();
						var productOffset = $row.offset().top - headerHeight;
						var productInfoRight = $productInfo.parent().offset().right;
						var productInfoWidth = $productInfo.parent().width();

						if ( scrolled >= productOffset ) {
							$productImgNav.addClass('is-sticky');

							if ( scrolled >= productOffset + productImgScrollerHeight - productImgNavHeight ) {
								$productImgNav.addClass('stick-to-bottom');
							} else {
								$productImgNav.removeClass('stick-to-bottom');
							}

							if ( productInfoHeight < productImgScrollerHeight ) {
								$productInfo.addClass('is-sticky');
								
								$productInfo.css({ right: productInfoRight, width: productInfoWidth });

								if ( scrolled >= productOffset + rowHeight - productInfoHeight ) {
									$productInfo.addClass('stick-to-bottom');
								} else {
									$productInfo.removeClass('stick-to-bottom');
								}
							}
						} else {
							$productImgNav.removeClass('is-sticky');
							$productInfo.removeClass('is-sticky');
							$productInfo.css({ right: 'auto', width: 'auto' });
						}

						for ( var i = $productImg.length - 1; i >= 0; i--) {
							var $currentProduct = $('.product-image').eq(i);
							var index = $currentProduct.attr('data-index');
							var productHeight = $currentProduct.outerHeight();
							var productOffset = $currentProduct.offset().top - headerHeight - productHeight;

							if (scrolled >= productOffset) {
								$productImgNav.find('.product-image-thumb[data-index="' + index + '"]').addClass('active').siblings().removeClass('active');
								break;
							}
						}
					} else {
						$productImgNav.removeClass('is-sticky stick-to-bottom');
						$productInfo.removeClass('is-sticky stick-to-bottom');
						$productInfo.css({ right: 'auto', width: 'auto' });
					}
				}, 10)
			).on('load', function() {
				isPageLoaded = true;
			});

			// Bind product thumb image click to scroll function
			$productImgNav.on('click', '.product-image-thumb', function() {
				var windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;

				if (windowWidth >= 1024) {
					var index = $(this).data('index');
					var $selectedImage = $('.product-image[data-index="' + index + '"]');
					var headerHeight = $('.header--standard').outerHeight();

					if ( $selectedImage.length ) {
						if ( isPageLoaded ) {
							$('html, body').stop( true, false ).animate({ scrollTop: $selectedImage.offset().top - headerHeight }, 500 );
						}
					}
				}
			});

			$(window).on('resize', Reqs.throttle(function(event){
				toggleMobileSlider();
				checkProductInfoHeight();
			}, 50));

			$(window).on('load', checkProductInfoHeight);

			toggleMobileSlider();

			function toggleMobileSlider() {
				var windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;

				if (windowWidth < 1024 && $('.js-productImgScroller .js-slide').length > 1) {
					initMobileSlider();	
				} else {
					destroyMobileSlider();
				}
			}
		}

		function checkProductInfoHeight() {
			var windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
			var productInfoHeight = $('.product-info__wrapper').outerHeight();
			var productImageHeight = $('.productImgScroller').outerHeight();

			if (productInfoHeight > productImageHeight && windowWidth >= 1024) {
				$productInfo.addClass('product-info__wrapper--static');
			} else {
				$productInfo.removeClass('product-info__wrapper--static');
			}
		}

		// If product layout is scroller and is mobile then load slider
		function initMobileSlider() {
			var $productImgSlider = $('.js-productImgScroller');
			var $productImgSliderNav = $('.js-productImgScroller-nav');
			var activeArrows = $productImgSlider.data('arrows');
			var activeDots = $productImgSlider.data('dots');
			var sliderNavArrows = $productImgSliderNav.find('.js-slide').length > 3;
			var activeSlide = $productImgSlider.find('.is-selected-product').index();
			activeSlide = activeSlide == -1 ? 0 : activeSlide;

			var flickity = $('.js-productImgScroller').data('flickity');
			var flickityNav = $('.js-productImgScroller-nav').data('flickity');

			if ( $productImgSlider.find('.js-slide').length > 1 ) {
				if (flickity == undefined) {

					$mobileSlider = $productImgSlider.flickity({
						cellSelector: '.js-slide',
						prevNextButtons: activeArrows,
						arrowShape: 'M 69.65625 6.96875 A 3.0003 3.0003 0 0 0 67.875 7.875 L 27.875 47.875 A 3.0003 3.0003 0 0 0 27.875 52.09375 L 67.875 92.09375 A 3.0003 3.0003 0 1 0 72.125 87.875 L 34.25 50 L 72.125 12.09375 A 3.0003 3.0003 0 0 0 69.65625 6.96875 z',
						pageDots: activeDots,
						initialIndex: activeSlide,
						selectedAttraction: 0.08,
						friction: 0.8,
						adaptiveHeight: true,
						contain: true
					});

					$mobileSlider.on('change.flickity', Site.setBadgePosition);
				}

				if (flickityNav == undefined) {
					$mobileSliderNav = $productImgSliderNav.flickity({
						cellSelector: '.js-slide',
						asNavFor: '.js-productImgScroller',
						initialIndex: activeSlide,
						pageDots: false,
						prevNextButtons: sliderNavArrows,
						arrowShape: 'M 69.65625 6.96875 A 3.0003 3.0003 0 0 0 67.875 7.875 L 27.875 47.875 A 3.0003 3.0003 0 0 0 27.875 52.09375 L 67.875 92.09375 A 3.0003 3.0003 0 1 0 72.125 87.875 L 34.25 50 L 72.125 12.09375 A 3.0003 3.0003 0 0 0 69.65625 6.96875 z',
						contain: true
					});
				}
			}

			Product.setSlidesHeight($productImgSlider);
			$(window).resize(
				Reqs.debounce(function(event){
					Product.setSlidesHeight($productImgSlider)
				}, 250)
			);
		}

		function destroyMobileSlider() {
			var flickity = $('.js-productImgScroller').data('flickity');
			var flickityNav = $('.js-productImgScroller-nav').data('flickity');

			if (flickity && flickity.isActive) {
				$mobileSlider.flickity('destroy')	
			}

			if (flickityNav && flickityNav.isActive) {
				$mobileSliderNav.flickity('destroy')	
			}
		}
	},

	setSlidesHeight: function($productImgSlider) {
		// Set height to slides if slider contains landscape images
		$productImgSlider.find('.js-slide').each(function() {
			var $slide = $(this);
			var imageAspectRatio = $(this).data('aspect-ratio');
			var slideWidth = $slide.width();
			var slideHeight = parseInt($slide.css('max-height'));
			var slideAspectRatio = slideWidth / slideHeight;
			var imageHeight = parseInt(slideWidth / imageAspectRatio);

			if (slideAspectRatio > imageAspectRatio) {
				$slide.css('height', slideHeight);
				$slide.parent().css('height', slideHeight);
			} else {
				$slide.css('height', imageHeight);
				$slide.parent().css('height', imageHeight);
			}
		});

		if ($productImgSlider.data('flickity') != undefined) {
			$productImgSlider.flickity('resize');
		}
	},

	/*
	 * Sticky "Shop" Bar in product.liquid
	 * Hidden via CSS under 768px viewport size
	 */
	shopBar: function() {
		var product = JSON.parse(document.getElementById( 'product-json' ).innerHTML);
		var $shopBar = $('#add-to-cart-bar');
		var $selectors = $( 'select', $shopBar );

		new Shopify.OptionSelectors('product-bar-select', {
			product: product,
			onVariantSelected: Product.selectCallback
		});

		manageOptions( product );

		function manageOptions( obj ) {
			if (obj['options'].length === 1 && obj['variants'].length){
				if (obj['variants'][0].title === 'Default Title') {
					for (i = 0; i < obj['options'].length; i++) {
						$('#product-bar-select-option-'+[i]).closest('.productForm-block').hide();
					}
				} else {
					for (i = 0; i < obj['options'].length; i++) {
						$('#product-bar-select-option-'+[i]).closest('.selector-wrapper').attr('data-id', '#product-bar-select-option-'+[i]).prepend('<span class="selectArrow"></span><label>'+obj['options'][0]+'</label>');
					}
				}
			} else if (obj['options'].length > 1){
				for (i = 0; i < obj['options'].length; i++) {
					$('#product-bar-select-option-'+[i]).closest('.selector-wrapper').attr('data-id', '#product-bar-select-option-'+[i]).prepend('<span class="selectArrow"></span>');
				}
			}
		}
	},

	productImages: function(){
		Reqs.imageSizing();

		var $imagefills = $('.js-imagefill');

		$imagefills.each(function(){
			$(this).imagefill();
		});

		var showImages = setInterval(function(){
			if ($imagefills.find('.product-image-img').attr('style') != ''){
				$imagefills.find('.product-image-img').css('opacity', 1);
				removeTimer();
			}
		}, 100);

		function removeTimer(){
			clearInterval(showImages);
		}
	},

	// this is what is being called from the product.liquid
	selectCallback: function(variant, selector) {
		Product.callback({
			money_format: "",
			variant: variant,
			selector: selector
		});

		var enableColorSwatches = $('.productForm').data('color_swatches');
		if (enableColorSwatches) {
			ColorSwatches.init(variant, selector);	
		}
	},

	callback: function(options){
		var moneyFormat = options.money_format,
			variant = options.variant,
			selector = options.selector;

			//el is options.selector.variantIdField, the tie that binds
			var gold = $(options.selector.variantIdField).attr('id');
			var id = gold.replace(/\D/g, '');
			var fp = $('.featured-product--'+id);

		if($(options.selector.variantIdField).parents('.featured-product').length > 0){

		var $submit = $(fp).find('.js-productForm-submit'),
			$shopbar_submit = $(fp).find('.js-shopBar-buy'),
			$price = $(fp).find('.product-price'),
			$normal_price = $(fp).find('.product-normal-price'),
			$sale_price = $(fp).find('.product-sale-price'),
			$compare_price = $(fp).find('.product-compare-price'),
			$counter = $(fp).find('.js-counter').not('.cart-product-quantity .js-counter'),
			$sale_container = $price.find('.sale'),
			container = $( '.js-product-template--' + id );	
		} else {
		var $submit = $('.js-productForm-submit'),
			$shopbar_submit = $('.js-shopBar-buy'),
			$price = $('.product-price'),
			$normal_price = $('.product-normal-price'),
			$sale_price = $('.product-sale-price'),
			$compare_price = $('.product-compare-price'),
			$counter = $('.js-counter').not('.cart-product-quantity .js-counter'),
			$sale_container = $price.find('.sale'),
			container = $( '[data-section-type="product-template"]' );
		}

		if (variant) {
			if (variant.available) {
				$submit.removeClass( 'is-disabled' ).prop( 'disabled', false ).html("Add To Cart");
				$shopbar_submit.removeClass('is-disabled').html("Buy Now");
				$counter.css({'opacity': 1, 'pointer-events': 'auto'});
				$price.css({'opacity': 1});

				$price.attr('data-price', variant.price);
				$normal_price.html(Shopify.formatMoney(variant.price, moneyFormat));

				if (variant.compare_at_price != null){
					if (variant.compare_at_price > variant.price) {
						if ($sale_container.length){
							$compare_price.html(Shopify.formatMoney(variant.compare_at_price, moneyFormat));
							$sale_price.html(Shopify.formatMoney(variant.price, moneyFormat));
						} else {
							$price.append('<div class="sale" itemprop="price"><strike class="product-compare-price"></strike>&nbsp;<span class="product-sale-price"></span></div>');
							$('.product-compare-price').html(Shopify.formatMoney(variant.compare_at_price, moneyFormat));
							$('.product-sale-price').html(Shopify.formatMoney(variant.price, moneyFormat));
						}
						$normal_price.hide();
						$sale_container.show();
					} else if (variant.compare_at_price <= variant.price) {
						if($normal_price.length) {
							$normal_price.html(Shopify.formatMoney(variant.price, moneyFormat));
						} else {
							$price.append('<div class="product-normal-price" itemprop="price">'+Shopify.formatMoney(variant.price, moneyFormat)+'</div>');
						}
						$sale_container.hide();
						$normal_price.show();
					}
				} else {
					$sale_container.hide();
					$normal_price.show();
					
				}
				document.addEventListener('shopify:payment_button:loaded', showButtons($submit));
				function showButtons($submit){
				  var sibling = $submit.next();
				  if($(sibling).hasClass('shopify-payment-button')){
						$(sibling).show();
				  }
				}
			}
			// this variant sold out
			else {  
				$submit.addClass('is-disabled').prop('disabled', true).html("SOLD OUT");
				$shopbar_submit.addClass('is-disabled').html("SOLD OUT");
				$counter.css({'opacity': 0.3, 'pointer-events': 'none'});
				$price.css({'opacity': 0.3});

				$price.attr('data-price', variant.price);
				$normal_price.html(Shopify.formatMoney(variant.price, moneyFormat));
			  
				document.addEventListener('shopify:payment_button:loaded', checkButtons($submit));
				function checkButtons($submit){
				  var sibling = $submit.next();
				  if($(sibling).hasClass('shopify-payment-button')){
						$(sibling).hide();
				  }
				}

				if (variant.compare_at_price != null){
					if (variant.compare_at_price > variant.price) {
						if ($sale_container.length){
							$compare_price.html(Shopify.formatMoney(variant.compare_at_price, moneyFormat));
							$sale_price.html(Shopify.formatMoney(variant.price, moneyFormat));
						} else {
							$price.append('<div class="sale" itemprop="price"><strike class="product-compare-price"></strike>&nbsp;<span class="product-sale-price"></span></div>');
							$('.product-compare-price').html(Shopify.formatMoney(variant.compare_at_price, moneyFormat));
							$('.product-sale-price').html(Shopify.formatMoney(variant.price, moneyFormat));
						}
						$normal_price.hide();
						$sale_container.show();
					} else if (variant.compare_at_price <= variant.price) {
						if($normal_price.length) {
							$normal_price.html(Shopify.formatMoney(variant.price, moneyFormat));
						} else {
							$price.append('<div class="product-normal-price" itemprop="price">'+Shopify.formatMoney(variant.price, moneyFormat)+'</div>');
						}
						$sale_container.hide();
						$normal_price.show();
					}
				} else {
					$sale_container.hide();
					$normal_price.show();
				}
			}
			
			Product.showVariantImage(variant, container);
			Product.variantPreview.getImage(variant);

		} else {
			$submit.addClass('is-disabled').prop('disabled', true).html("UNAVAILABLE");
			$counter.css({'opacity': .3, 'pointer-events': 'none'});
			$price.css({'opacity': 0.3});
			document.addEventListener('shopify:payment_button:loaded', checkButtons($submit));
				function checkButtons($submit){
				  var sibling = $submit.next();
				  if($(sibling).hasClass('shopify-payment-button')){
						$(sibling).hide();
				  }
				}
		}
	},

	// show variant image within quickView or within slideshow (mobile product page)
	showVariantImage: function(variant, container) {
		var $quickView = $('.quickView--is-active .quickView'),
			variantImage = variant.featured_image ? variant.featured_image.src : false,
			variantID = variant.id;

		if( variantImage ) {
			// Remove protocol to match original src markup
			variantImage = variantImage.substring(variantImage.indexOf('//'));
		}

		if( $quickView.length && container.hasClass( 'js-collectionBlock' ) ) {
			// Show variant image in quick view
			var $imageContainer = $quickView.find('.quickView-img'),
				$variantImages = $imageContainer.children(),
				$URLs = $quickView.find('.js-productUrl');

			$currentVariantImage = variantImage ? $variantImages.filter('[data-bgset*="'+variantImage+'"]') : $();

			if(!$currentVariantImage.length) {

				if(variantImage) {
					$currentVariantImage = $variantImages.first().clone();

					$currentVariantImage
						.attr('data-bgset', variantImage)
						.removeAttr('style')
						.removeClass('bg-loading bg-loaded quickView-variant-img--is-active')
						.appendTo($imageContainer);

				} else {
					$currentVariantImage = $variantImages.first();
				}
			}

			setTimeout(function() {
				$currentVariantImage
					.addClass('quickView-variant-img--is-active')
					.siblings().removeClass('quickView-variant-img--is-active');

				// swap URLs to support variant deep-linking
				$URLs.each(function(){
					// if the URL doesn't have a query string, just use the base URL
					// otherwise, remove the query string and add a new one with the new variantID
					var current_url = $(this).attr('href').indexOf('?variant') != -1 ? $(this).attr('href').substring(0, $(this).attr('href').indexOf('?')) : $(this).attr('href');
					$(this).attr('href', current_url + '?variant=' + variantID);
				});
			});

		} else {
			// Show variant image preview in product page
			var $imgSlider = container.find('.productImgSlider').first();
			var $imgScrollerNav = container.find('.productImgScroller-nav');
			var flick = $imgSlider.data('flickity');

			// Activate image slide in mobile view
			if(flick && flick.isActive) {
				var $variantSlide = $imgSlider.find('[data-image="'+variantImage+'"]');
				if ($variantSlide.index() != -1) {
					flick.select($variantSlide.index());	
				}
				
				$('.product-image').removeClass('is-selected-product');
				$variantSlide.addClass('is-selected-product');
			} else {
				var $variantSlide = $imgScrollerNav.find('[data-image="'+variantImage+'"]');

				if ( $variantSlide.length ) {
					$variantSlide.trigger('click');
				}
			}
		}
	},

	variantPreview: {
		triggeredByUser: false,
		selected_img: $(''),
		selected_img_url: '',
		bind: function(){
			$('.js-variant-preview').on('click', function(){
				Product.variantPreview.scrollTarget(selected_img);
			});
		},
		getImage: function(variant){
			// if there are NO variant images, use the first image on the page
			// if there are NO images at all, return an empty string
			var newImage = variant.featured_image ? variant.featured_image.src :
					$('.product-image').first() ? $('.product-image').first().attr('data-image') : '',
				$container = $('.js-variant-preview'),
				currentImage = $container.attr('data-bg-src'),
				$productSlides = $('.product-image');

			if (newImage){
				// need to set this var if we want to add a SELECTED
				// tag to an image on load, which only happens if
				// the url has a ?variant string in it
				selected_img_url = newImage.substring(newImage.indexOf('//'));
			}

			// first page load
			if(!this.triggeredByUser) {
				// IF the URL has a variant already selected
				// get new image url and match it to the corresponding product-image

				$productSlides.each(function(){
					var image_url = $(this).attr('data-image');
					var id = $(this).attr('data-id');
					$(this).removeClass('is-selected-product');
				});
				// either way, init the click event, and set the triggeredByUser
				// var to true so the preview can show, now that initial load
				// is out of the way
				this.bind();
				this.triggeredByUser = true;
				return;
			}
		},

		// fades all product images except the image passed as the @param
		fade: function(selected_img){
			$('.product-image').not(selected_img).addClass('fadeOut');
			this.fadeTimer = setTimeout(function(){
				$('.product-image').removeClass('fadeOut');
			}, 2000);
		},

		// @param variant = the url of the image
		scrollTarget: function(selected_img){
			var targetOffset = selected_img.offset().top,
				scrollTarget = targetOffset - (($(window).height() - selected_img.outerHeight()) / 2);

			$('html, body').animate({scrollTop: scrollTarget}, 500, function(){
				Product.variantPreview.fade(selected_img);
			});
		}
	},

	variantPopover: {
		triggeredByUser: false,
		popoverTimer: 0,
		fadeTimer: 0,
		selected_img: $(''),
		selected_img_url: '',
		init: function(){
			$('#VariantPopoverContainer').on('click', function(){
				Product.variantPopover.scrollTarget(selected_img);
			});
		},
		getImage: function(variant){
			if(!this.triggeredByUser) {
				this.triggeredByUser = true;
				return;
			}

			var newImage = variant.featured_image ? variant.featured_image.src : false,
				$container = $('#VariantPopoverContainer .popover'),
				currentImage = $container.find('.popover-item-thumb').attr('data-bg-src'),
				$productImages = $('.product-image'),

				// handlebars vars
				data = {},
				source = $('#VariantPopover').html(),
				template = Handlebars.compile(source);

			clearTimeout(this.popoverTimer); // clear popover timer

			// if the variant has a NEW image, that isn't the same as the currently shown variant image
			// initiate popover
			if (newImage && (newImage !== currentImage)) {

				// Create new locally available vars for the selected image and it's src URL
				// Also, add classes to show which product-image is selected
				if (this.triggeredByUser){
					selected_img_url = newImage.substring(newImage.indexOf('//'));
					$productImages.each(function(){
						var image_url = $(this).attr('data-image');
						$(this).removeClass('is-selected-product');
						if (image_url == selected_img_url) {
							$(this).addClass('is-selected-product');
							return selected_img = $(this);
						}
					});
				}

				// if image is fully visible, don't show the popover, just fade out the other products
				// However, *do* swap the image in the popover, since the logic to hide/show it depends
				// on the image being different than what is selected.
				if (selected_img.offset().top > $(window).scrollTop() && $(window).width() > 768) {
					// clearTimeout(this.fadeTimer);
					// Product.variantPopover.fade(selected_img);
					$container.removeClass('is-visible'); // hide popover
					$container.empty(); // if there's a new image, clear the container for the new one
					data = {
						img: newImage, // create data for Handlebars
					};
					$container.append(template(data)); // append the new image via Handlebars
					return;
				}

				$productImages.removeClass('fadeOut');

				$container.empty(); // if there's a new image, clear the container for the new one

				data = {
					img: newImage, // create data for Handlebars
				};

				$container.append(template(data)); // append the new image via Handlebars

				$container.addClass('is-visible'); // show popover

				this.popoverTimer = setTimeout(function(){
					$container.removeClass('is-visible'); // hide popover
				}, 3000);
			}
		},

		// fades all product images except the image passed as the @param
		fade: function(selected_img){
			$('.product-image').not(selected_img).addClass('fadeOut');
			this.fadeTimer = setTimeout(function(){
				$('.product-image').removeClass('fadeOut');
			}, 2000);
		},

		// @param variant = the url of the image
		scrollTarget: function(selected_img){
			var targetOffset = selected_img.offset().top,
				scrollTarget = targetOffset - (($(window).height() - selected_img.outerHeight()) / 2);

			$('html, body').animate({scrollTop: scrollTarget}, 500, function(){
				// Product.variantPopover.fade(selected_img);
			});
		}
	},

	imageZoom: {
		init: function(){
			Reqs.pannZoom();

			$('.product-image-img').on('click', function(){
				var image_url = $(this).closest('.product-image').attr('data-bg-src') || $(this).closest('.product-image').attr('data-image');
				imageZoom.image(image_url);
			});
		},
		image: function(url){
			var modal = $('.mobile-zoom-overlay'),
				modal_img = new Image();

			modal_img.src = url;
			modal.append(modal_img);

			$(modal_img).load(function(){
				var $img = $(this),
					img_height = $img.height(),
					img_position = (($(window).innerHeight() - img_height)/2);

				$img.css('top', img_position);
				modal.addClass('is-visible');
				$img.addClass('fade-in');
				$img.panzoom();
			});

			$('.js-MobileZoom-close').on('click', function(){
				imageZoom.hide(modal);
			});
		},
		hide: function(modal){
			modal.addClass('is-hiding');
			setTimeout(function(){
				modal.removeClass('is-hiding is-visible');
				modal.find('img').panzoom('destroy').remove(); // kill zoom and remove <img>
			}, 300);
		}
	}
}

var Blog = {
	init: function() {
		var self = this;
		var $blog = $('#blog-template');
		var showFeatured = $blog.data('featured');
		var itemSelector = $('.blogModule-posts');

		Blog.truncateText( itemSelector );
		
		$(window)
			.on('resize', Reqs.throttle(function() {
				Blog.truncateText( itemSelector );
			}, 50))
			.on('load', function() {
				Blog.truncateText( itemSelector );
			});

		if (showFeatured) {
			self.featuredTruncate();
			$(window)
				.on('resize', Reqs.throttle(self.featuredTruncate, 50))
				.on('load', self.featuredTruncate);

			// Start from second page if featured article enabled
			$blog.find('.loadMore').trigger('click');
		}

		$(document).on('ajaxify:updated', function() {
			self.truncateText( itemSelector );
		});

		var container = $('.blogModule-posts');
		var item = '.blogModule-posts-post';
		Site.scroller( container, item );
	},

	truncateText: function( itemSelector ) {
		var textHasImage = itemSelector.find('.blogModule-posts-post--has-image').find('.h3, .excerpt');
		var textNoImage = itemSelector.find('.blogModule-posts-post--no-image').find('.h3, .excerpt');

		textHasImage.trunk8({
			lines: 2
		});

		textNoImage.trunk8({
			lines: 4
		});
	},

	featuredTruncate: function() {
		var featuredArticle = $('.article--featured');
		var title = featuredArticle.find('.js-title');
		var excerpt = featuredArticle.find('.js-article__excerpt > p');
		
		title.trunk8({
			lines: 2
		});

		excerpt.trunk8({
			lines: 5
		});

		featuredArticle.removeClass('is-loading');
	}
}

var Reqs = {
	/*
	 * Pan Zoom library
	 * Zoom 1.7.14 – License: MIT – http://www.jacklmoore.com/zoom
	 */
	panZoom: function(){
		(function($){var defaults={url:false,callback:false,target:false,duration:120,on:"mouseover",touch:true,onZoomIn:false,onZoomOut:false,magnify:1};$.zoom=function(target,source,img,magnify){var targetHeight,targetWidth,sourceHeight,sourceWidth,xRatio,yRatio,offset,$target=$(target),position=$target.css("position"),$source=$(source);$target.css("position",/(absolute|fixed)/.test(position)?position:"relative");$target.css("overflow","hidden");img.style.width=img.style.height="";$(img).addClass("zoomImg").css({position:"absolute",top:0,left:0,opacity:0,width:img.width*magnify,height:img.height*magnify,border:"none",maxWidth:"none",maxHeight:"none"}).appendTo(target);return{init:function(){targetWidth=$target.outerWidth();targetHeight=$target.outerHeight();if(source===$target[0]){sourceWidth=targetWidth;sourceHeight=targetHeight}else{sourceWidth=$source.outerWidth();sourceHeight=$source.outerHeight()}xRatio=(img.width-targetWidth)/sourceWidth;yRatio=(img.height-targetHeight)/sourceHeight;offset=$source.offset()},move:function(e){var left=e.pageX-offset.left,top=e.pageY-offset.top;top=Math.max(Math.min(top,sourceHeight),0);left=Math.max(Math.min(left,sourceWidth),0);img.style.left=left*-xRatio+"px";img.style.top=top*-yRatio+"px"}}};$.fn.zoom=function(options){return this.each(function(){var settings=$.extend({},defaults,options||{}),target=settings.target||this,source=this,$source=$(source),$target=$(target),img=document.createElement("img"),$img=$(img),mousemove="mousemove.zoom",clicked=false,touched=false,$urlElement;if(!settings.url){$urlElement=$source.find("img");if($urlElement[0]){settings.url=$urlElement.data("src")||$urlElement.attr("src")}if(!settings.url){return}}(function(){var position=$target.css("position");var overflow=$target.css("overflow");$source.one("zoom.destroy",function(){$source.off(".zoom");$target.css("position",position);$target.css("overflow",overflow);$img.remove()})})();img.onload=function(){var zoom=$.zoom(target,source,img,settings.magnify);function start(e){zoom.init();zoom.move(e);$img.stop().fadeTo($.support.opacity?settings.duration:0,1,$.isFunction(settings.onZoomIn)?settings.onZoomIn.call(img):false)}function stop(){$img.stop().fadeTo(settings.duration,0,$.isFunction(settings.onZoomOut)?settings.onZoomOut.call(img):false)}if(settings.on==="grab"){$source.on("mousedown.zoom",function(e){if(e.which===1){$(document).one("mouseup.zoom",function(){stop();$(document).off(mousemove,zoom.move)});start(e);$(document).on(mousemove,zoom.move);e.preventDefault()}})}else if(settings.on==="click"){$source.on("click.zoom",function(e){if(clicked){return}else{clicked=true;start(e);$(document).on(mousemove,zoom.move);$(document).one("click.zoom",function(){stop();clicked=false;$(document).off(mousemove,zoom.move)});return false}})}else if(settings.on==="toggle"){$source.on("click.zoom",function(e){if(clicked){stop()}else{start(e)}clicked=!clicked})}else if(settings.on==="mouseover"){zoom.init();$source.on("mouseenter.zoom",start).on("mouseleave.zoom",stop).on(mousemove,zoom.move)}if(settings.touch){$source.on("touchstart.zoom",function(e){e.preventDefault();if(touched){touched=false;stop()}else{touched=true;start(e.originalEvent.touches[0]||e.originalEvent.changedTouches[0])}}).on("touchmove.zoom",function(e){e.preventDefault();zoom.move(e.originalEvent.touches[0]||e.originalEvent.changedTouches[0])})}if($.isFunction(settings.callback)){settings.callback.call(img)}};img.src=settings.url})};$.fn.zoom.defaults=defaults})(window.jQuery);
	},
	pannZoom: function(){
		/**
		 * @license jquery.panzoom.js v2.0.5
		 * Updated: Thu Jul 03 2014
		 * Add pan and zoom functionality to any element
		 * Copyright (c) 2014 timmy willison
		 * Released under the MIT license
		 * https://github.com/timmywil/jquery.panzoom/blob/master/MIT-License.txt
		 */
		!function(a,b){"function"==typeof define&&define.amd?define(["jquery"],function(c){return b(a,c)}):"object"==typeof exports?b(a,require("jquery")):b(a,a.jQuery)}("undefined"!=typeof window?window:this,function(a,b){"use strict";function c(a,b){for(var c=a.length;--c;)if(+a[c]!==+b[c])return!1;return!0}function d(a){var c={range:!0,animate:!0};return"boolean"==typeof a?c.animate=a:b.extend(c,a),c}function e(a,c,d,e,f,g,h,i,j){this.elements="array"===b.type(a)?[+a[0],+a[2],+a[4],+a[1],+a[3],+a[5],0,0,1]:[a,c,d,e,f,g,h||0,i||0,j||1]}function f(a,b,c){this.elements=[a,b,c]}function g(a,c){if(!(this instanceof g))return new g(a,c);1!==a.nodeType&&b.error("Panzoom called on non-Element node"),b.contains(l,a)||b.error("Panzoom element must be attached to the document");var d=b.data(a,m);if(d)return d;this.options=c=b.extend({},g.defaults,c),this.elem=a;var e=this.$elem=b(a);this.$set=c.$set&&c.$set.length?c.$set:e,this.$doc=b(a.ownerDocument||l),this.$parent=e.parent(),this.isSVG=r.test(a.namespaceURI)&&"svg"!==a.nodeName.toLowerCase(),this.panning=!1,this._buildTransform(),this._transform=!this.isSVG&&b.cssProps.transform.replace(q,"-$1").toLowerCase(),this._buildTransition(),this.resetDimensions();var f=b(),h=this;b.each(["$zoomIn","$zoomOut","$zoomRange","$reset"],function(a,b){h[b]=c[b]||f}),this.enable(),b.data(a,m,this)}var h="over out down up move enter leave cancel".split(" "),i=b.extend({},b.event.mouseHooks),j={};if(a.PointerEvent)b.each(h,function(a,c){b.event.fixHooks[j[c]="pointer"+c]=i});else{var k=i.props;i.props=k.concat(["touches","changedTouches","targetTouches","altKey","ctrlKey","metaKey","shiftKey"]),i.filter=function(a,b){var c,d=k.length;if(!b.pageX&&b.touches&&(c=b.touches[0]))for(;d--;)a[k[d]]=c[k[d]];return a},b.each(h,function(a,c){if(2>a)j[c]="mouse"+c;else{var d="touch"+("down"===c?"start":"up"===c?"end":c);b.event.fixHooks[d]=i,j[c]=d+" mouse"+c}})}b.pointertouch=j;var l=a.document,m="__pz__",n=Array.prototype.slice,o=!!a.PointerEvent,p=function(){var a=l.createElement("input");return a.setAttribute("oninput","return"),"function"==typeof a.oninput}(),q=/([A-Z])/g,r=/^http:[\w\.\/]+svg$/,s=/^inline/,t="(\\-?[\\d\\.e]+)",u="\\,?\\s*",v=new RegExp("^matrix\\("+t+u+t+u+t+u+t+u+t+u+t+"\\)$");return e.prototype={x:function(a){var b=a instanceof f,c=this.elements,d=a.elements;return b&&3===d.length?new f(c[0]*d[0]+c[1]*d[1]+c[2]*d[2],c[3]*d[0]+c[4]*d[1]+c[5]*d[2],c[6]*d[0]+c[7]*d[1]+c[8]*d[2]):d.length===c.length?new e(c[0]*d[0]+c[1]*d[3]+c[2]*d[6],c[0]*d[1]+c[1]*d[4]+c[2]*d[7],c[0]*d[2]+c[1]*d[5]+c[2]*d[8],c[3]*d[0]+c[4]*d[3]+c[5]*d[6],c[3]*d[1]+c[4]*d[4]+c[5]*d[7],c[3]*d[2]+c[4]*d[5]+c[5]*d[8],c[6]*d[0]+c[7]*d[3]+c[8]*d[6],c[6]*d[1]+c[7]*d[4]+c[8]*d[7],c[6]*d[2]+c[7]*d[5]+c[8]*d[8]):!1},inverse:function(){var a=1/this.determinant(),b=this.elements;return new e(a*(b[8]*b[4]-b[7]*b[5]),a*-(b[8]*b[1]-b[7]*b[2]),a*(b[5]*b[1]-b[4]*b[2]),a*-(b[8]*b[3]-b[6]*b[5]),a*(b[8]*b[0]-b[6]*b[2]),a*-(b[5]*b[0]-b[3]*b[2]),a*(b[7]*b[3]-b[6]*b[4]),a*-(b[7]*b[0]-b[6]*b[1]),a*(b[4]*b[0]-b[3]*b[1]))},determinant:function(){var a=this.elements;return a[0]*(a[8]*a[4]-a[7]*a[5])-a[3]*(a[8]*a[1]-a[7]*a[2])+a[6]*(a[5]*a[1]-a[4]*a[2])}},f.prototype.e=e.prototype.e=function(a){return this.elements[a]},g.rmatrix=v,g.events=b.pointertouch,g.defaults={eventNamespace:".panzoom",transition:!0,cursor:"move",disablePan:!1,disableZoom:!1,increment:.3,minScale:.4,maxScale:5,rangeStep:.05,duration:200,easing:"ease-in-out",contain:!1},g.prototype={constructor:g,instance:function(){return this},enable:function(){this._initStyle(),this._bind(),this.disabled=!1},disable:function(){this.disabled=!0,this._resetStyle(),this._unbind()},isDisabled:function(){return this.disabled},destroy:function(){this.disable(),b.removeData(this.elem,m)},resetDimensions:function(){var a=this.$parent;this.container={width:a.innerWidth(),height:a.innerHeight()};var c,d=a.offset(),e=this.elem,f=this.$elem;this.isSVG?(c=e.getBoundingClientRect(),c={left:c.left-d.left,top:c.top-d.top,width:c.width,height:c.height,margin:{left:0,top:0}}):c={left:b.css(e,"left",!0)||0,top:b.css(e,"top",!0)||0,width:f.innerWidth(),height:f.innerHeight(),margin:{top:b.css(e,"marginTop",!0)||0,left:b.css(e,"marginLeft",!0)||0}},c.widthBorder=b.css(e,"borderLeftWidth",!0)+b.css(e,"borderRightWidth",!0)||0,c.heightBorder=b.css(e,"borderTopWidth",!0)+b.css(e,"borderBottomWidth",!0)||0,this.dimensions=c},reset:function(a){a=d(a);var b=this.setMatrix(this._origTransform,a);a.silent||this._trigger("reset",b)},resetZoom:function(a){a=d(a);var b=this.getMatrix(this._origTransform);a.dValue=b[3],this.zoom(b[0],a)},resetPan:function(a){var b=this.getMatrix(this._origTransform);this.pan(b[4],b[5],d(a))},setTransform:function(a){for(var c=this.isSVG?"attr":"style",d=this.$set,e=d.length;e--;)b[c](d[e],"transform",a)},getTransform:function(a){var c=this.$set,d=c[0];return a?this.setTransform(a):a=b[this.isSVG?"attr":"style"](d,"transform"),"none"===a||v.test(a)||this.setTransform(a=b.css(d,"transform")),a||"none"},getMatrix:function(a){var b=v.exec(a||this.getTransform());return b&&b.shift(),b||[1,0,0,1,0,0]},setMatrix:function(a,c){if(!this.disabled){c||(c={}),"string"==typeof a&&(a=this.getMatrix(a));var d,e,f,g,h,i,j,k,l,m,n=+a[0],o=this.$parent,p="undefined"!=typeof c.contain?c.contain:this.options.contain;return p&&(d=this._checkDims(),e=this.container,l=d.width+d.widthBorder,m=d.height+d.heightBorder,f=(l*Math.abs(n)-e.width)/2,g=(m*Math.abs(n)-e.height)/2,j=d.left+d.margin.left,k=d.top+d.margin.top,"invert"===p?(h=l>e.width?l-e.width:0,i=m>e.height?m-e.height:0,f+=(e.width-l)/2,g+=(e.height-m)/2,a[4]=Math.max(Math.min(a[4],f-j),-f-j-h),a[5]=Math.max(Math.min(a[5],g-k),-g-k-i+d.heightBorder)):(g+=d.heightBorder/2,h=e.width>l?e.width-l:0,i=e.height>m?e.height-m:0,"center"===o.css("textAlign")&&s.test(b.css(this.elem,"display"))?h=0:f=g=0,a[4]=Math.min(Math.max(a[4],f-j),-f-j+h),a[5]=Math.min(Math.max(a[5],g-k),-g-k+i))),"skip"!==c.animate&&this.transition(!c.animate),c.range&&this.$zoomRange.val(n),this.setTransform("matrix("+a.join(",")+")"),c.silent||this._trigger("change",a),a}},isPanning:function(){return this.panning},transition:function(a){if(this._transition)for(var c=a||!this.options.transition?"none":this._transition,d=this.$set,e=d.length;e--;)b.style(d[e],"transition")!==c&&b.style(d[e],"transition",c)},pan:function(a,b,c){if(!this.options.disablePan){c||(c={});var d=c.matrix;d||(d=this.getMatrix()),c.relative&&(a+=+d[4],b+=+d[5]),d[4]=a,d[5]=b,this.setMatrix(d,c),c.silent||this._trigger("pan",d[4],d[5])}},zoom:function(a,c){"object"==typeof a?(c=a,a=null):c||(c={});var d=b.extend({},this.options,c);if(!d.disableZoom){var g=!1,h=d.matrix||this.getMatrix();"number"!=typeof a&&(a=+h[0]+d.increment*(a?-1:1),g=!0),a>d.maxScale?a=d.maxScale:a<d.minScale&&(a=d.minScale);var i=d.focal;if(i&&!d.disablePan){var j=this._checkDims(),k=i.clientX,l=i.clientY;this.isSVG||(k-=(j.width+j.widthBorder)/2,l-=(j.height+j.heightBorder)/2);var m=new f(k,l,1),n=new e(h),o=this.parentOffset||this.$parent.offset(),p=new e(1,0,o.left-this.$doc.scrollLeft(),0,1,o.top-this.$doc.scrollTop()),q=n.inverse().x(p.inverse().x(m)),r=a/h[0];n=n.x(new e([r,0,0,r,0,0])),m=p.x(n.x(q)),h[4]=+h[4]+(k-m.e(0)),h[5]=+h[5]+(l-m.e(1))}h[0]=a,h[3]="number"==typeof d.dValue?d.dValue:a,this.setMatrix(h,{animate:"boolean"==typeof d.animate?d.animate:g,range:!d.noSetRange}),d.silent||this._trigger("zoom",h[0],d)}},option:function(a,c){var d;if(!a)return b.extend({},this.options);if("string"==typeof a){if(1===arguments.length)return void 0!==this.options[a]?this.options[a]:null;d={},d[a]=c}else d=a;this._setOptions(d)},_setOptions:function(a){b.each(a,b.proxy(function(a,c){switch(a){case"disablePan":this._resetStyle();case"$zoomIn":case"$zoomOut":case"$zoomRange":case"$reset":case"disableZoom":case"onStart":case"onChange":case"onZoom":case"onPan":case"onEnd":case"onReset":case"eventNamespace":this._unbind()}switch(this.options[a]=c,a){case"disablePan":this._initStyle();case"$zoomIn":case"$zoomOut":case"$zoomRange":case"$reset":this[a]=c;case"disableZoom":case"onStart":case"onChange":case"onZoom":case"onPan":case"onEnd":case"onReset":case"eventNamespace":this._bind();break;case"cursor":b.style(this.elem,"cursor",c);break;case"minScale":this.$zoomRange.attr("min",c);break;case"maxScale":this.$zoomRange.attr("max",c);break;case"rangeStep":this.$zoomRange.attr("step",c);break;case"startTransform":this._buildTransform();break;case"duration":case"easing":this._buildTransition();case"transition":this.transition();break;case"$set":c instanceof b&&c.length&&(this.$set=c,this._initStyle(),this._buildTransform())}},this))},_initStyle:function(){var a={"backface-visibility":"hidden","transform-origin":this.isSVG?"0 0":"50% 50%"};this.options.disablePan||(a.cursor=this.options.cursor),this.$set.css(a);var c=this.$parent;c.length&&!b.nodeName(c[0],"body")&&(a={overflow:"hidden"},"static"===c.css("position")&&(a.position="relative"),c.css(a))},_resetStyle:function(){this.$elem.css({cursor:"",transition:""}),this.$parent.css({overflow:"",position:""})},_bind:function(){var a=this,c=this.options,d=c.eventNamespace,e=o?"pointerdown"+d:"touchstart"+d+" mousedown"+d,f=o?"pointerup"+d:"touchend"+d+" click"+d,h={},i=this.$reset,j=this.$zoomRange;if(b.each(["Start","Change","Zoom","Pan","End","Reset"],function(){var a=c["on"+this];b.isFunction(a)&&(h["panzoom"+this.toLowerCase()+d]=a)}),c.disablePan&&c.disableZoom||(h[e]=function(b){var d;("touchstart"===b.type?!(d=b.touches)||(1!==d.length||c.disablePan)&&2!==d.length:c.disablePan||1!==b.which)||(b.preventDefault(),b.stopPropagation(),a._startMove(b,d))}),this.$elem.on(h),i.length&&i.on(f,function(b){b.preventDefault(),a.reset()}),j.length&&j.attr({step:c.rangeStep===g.defaults.rangeStep&&j.attr("step")||c.rangeStep,min:c.minScale,max:c.maxScale}).prop({value:this.getMatrix()[0]}),!c.disableZoom){var k=this.$zoomIn,l=this.$zoomOut;k.length&&l.length&&(k.on(f,function(b){b.preventDefault(),a.zoom()}),l.on(f,function(b){b.preventDefault(),a.zoom(!0)})),j.length&&(h={},h[(o?"pointerdown":"mousedown")+d]=function(){a.transition(!0)},h[(p?"input":"change")+d]=function(){a.zoom(+this.value,{noSetRange:!0})},j.on(h))}},_unbind:function(){this.$elem.add(this.$zoomIn).add(this.$zoomOut).add(this.$reset).off(this.options.eventNamespace)},_buildTransform:function(){return this._origTransform=this.getTransform(this.options.startTransform)},_buildTransition:function(){if(this._transform){var a=this.options;this._transition=this._transform+" "+a.duration+"ms "+a.easing}},_checkDims:function(){var a=this.dimensions;return a.width&&a.height||this.resetDimensions(),this.dimensions},_getDistance:function(a){var b=a[0],c=a[1];return Math.sqrt(Math.pow(Math.abs(c.clientX-b.clientX),2)+Math.pow(Math.abs(c.clientY-b.clientY),2))},_getMiddle:function(a){var b=a[0],c=a[1];return{clientX:(c.clientX-b.clientX)/2+b.clientX,clientY:(c.clientY-b.clientY)/2+b.clientY}},_trigger:function(a){"string"==typeof a&&(a="panzoom"+a),this.$elem.triggerHandler(a,[this].concat(n.call(arguments,1)))},_startMove:function(a,d){var e,f,g,h,i,j,k,m,n=this,p=this.options,q=p.eventNamespace,r=this.getMatrix(),s=r.slice(0),t=+s[4],u=+s[5],v={matrix:r,animate:"skip"};o?(f="pointermove",g="pointerup"):"touchstart"===a.type?(f="touchmove",g="touchend"):(f="mousemove",g="mouseup"),f+=q,g+=q,this.transition(!0),this.panning=!0,this._trigger("start",a,d),d&&2===d.length?(h=this._getDistance(d),i=+r[0],j=this._getMiddle(d),e=function(a){a.preventDefault();var b=n._getMiddle(d=a.touches),c=n._getDistance(d)-h;n.zoom(c*(p.increment/100)+i,{focal:b,matrix:r,animate:!1}),n.pan(+r[4]+b.clientX-j.clientX,+r[5]+b.clientY-j.clientY,v),j=b}):(k=a.pageX,m=a.pageY,e=function(a){a.preventDefault(),n.pan(t+a.pageX-k,u+a.pageY-m,v)}),b(l).off(q).on(f,e).on(g,function(a){a.preventDefault(),b(this).off(q),n.panning=!1,a.type="panzoomend",n._trigger(a,r,!c(r,s))})}},b.Panzoom=g,b.fn.panzoom=function(a){var c,d,e,f;return"string"==typeof a?(f=[],d=n.call(arguments,1),this.each(function(){c=b.data(this,m),c?"_"!==a.charAt(0)&&"function"==typeof(e=c[a])&&void 0!==(e=e.apply(c,d))&&f.push(e):f.push(void 0)}),f.length?1===f.length?f[0]:f:this):this.each(function(){new g(this,a)})},g});
	},
	imageSizing: function(){
		/**
		 * imagefill.js
		 * Author & copyright (c) 2013: John Polacek
		 * johnpolacek.com
		 * https://twitter.com/johnpolacek
		 *
		 * Dual MIT & GPL license
		 *
		 * Project Page: http://johnpolacek.github.io/imagefill.js
		 *
		 * The jQuery plugin for making images fill their containers (and be centered)
		 *
		 * EXAMPLE
		 * Given this html:
		 * <div class="container"><img src="myawesomeimage" /></div>
		 * $('.container').imagefill(); // image stretches to fill container
		 *
		 * REQUIRES:
		 * imagesLoaded - https://github.com/desandro/imagesloaded
		 *
		 */
		 ;(function($) {

		  $.fn.imagefill = function(options) {

			var $container = this,
				imageAspect = 1/1,
				containersH = 0,
				containersW = 0,
				defaults = {
				  runOnce: false,
				  target: 'img',
				  throttle : 200  // 5fps
				},
				settings = $.extend({}, defaults, options);

			var $img = $container.find(settings.target).addClass('loading').css({'position':'absolute'});

			// make sure container isn't position:static
			var containerPos = $container.css('position');
			$container.css({'overflow':'hidden','position':(containerPos === 'static') ? 'relative' : containerPos});

			// set containerH, containerW
			$container.each(function() {
			  containersH += $(this).outerHeight();
			  containersW += $(this).outerWidth();
			});

			// wait for image to load, then fit it inside the container
			$container.imagesLoaded().done(function(img) {
			  imageAspect = $img.width() / $img.height();
			  $img.removeClass('loading');
			  fitImages();
			  if (!settings.runOnce) {
				checkSizeChange();
			  }
			});

			function fitImages() {
			  containersH  = 0;
			  containersW = 0;
			  $container.each(function() {
				imageAspect = $(this).find(settings.target).width() / $(this).find(settings.target).height();
				var containerW = $(this).outerWidth(),
					containerH = $(this).outerHeight();
				containersH += $(this).outerHeight();
				containersW += $(this).outerWidth();

				var containerAspect = containerW/containerH;
				if (containerAspect < imageAspect) {
				  // taller
				  $(this).find(settings.target).css({
					  width: 'auto',
					  height: containerH,
					  top:0,
					  left:-(containerH*imageAspect-containerW)/2
					});
				} else {
				  // wider
				  $(this).find(settings.target).css({
					  width: containerW,
					  height: 'auto',
					  top:-(containerW/imageAspect-containerH)/2,
					  left:0
					});
				}
			  });
		  $(window).trigger('fit-images');
			}

			function checkSizeChange() {
			  var checkW = 0,
				  checkH = 0;
			  $container.each(function() {
				checkH += $(this).outerHeight();
				checkW += $(this).outerWidth();
			  });
			  if (containersH !== checkH || containersW !== checkW) {
				fitImages();
			  }
			  setTimeout(checkSizeChange, settings.throttle);
			}

			return this;
		  };

		}(jQuery));
	},
	throttle: function(fn, threshhold, scope) {
		threshhold || (threshhold = 250);

		var last,
			deferTimer;

		return function () {
			var context = scope || this;

			var now = +new Date,
				args = arguments;

			if (last && now < last + threshhold) {
				// hold on to it
				clearTimeout(deferTimer);
				deferTimer = setTimeout(function () {
					last = now;
					fn.apply(context, args);
				}, threshhold);
			} else {
				last = now;
				fn.apply(context, args);
			}
		}
	},
	debounce: function(fn, wait, immediate) {
		var timeout;
		return function() {
			var context = this, args = arguments;
			var later = function() {
				timeout = null;
				if (!immediate) fn.apply(context, args);
			};
			var callNow = immediate && !timeout;
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
			if (callNow) fn.apply(context, args);
		};
	},
	zoom: function() {
		/*!
			Zoom 1.7.20
			license: MIT
			http://www.jacklmoore.com/zoom
		*/
		(function(o){var t={url:!1,callback:!1,target:!1,duration:120,on:"mouseover",touch:!0,onZoomIn:!1,onZoomOut:!1,magnify:1};o.zoom=function(t,n,e,i){var u,c,r,a,m,l,s,f=o(t),h=f.css("position"),d=o(n);return t.style.position=/(absolute|fixed)/.test(h)?h:"relative",t.style.overflow="hidden",e.style.width=e.style.height="",o(e).addClass("zoomImg").css({position:"absolute",top:0,left:0,opacity:0,width:e.width*i,height:e.height*i,border:"none",maxWidth:"none",maxHeight:"none"}).appendTo(t),{init:function(){c=f.outerWidth(),u=f.outerHeight(),n===t?(a=c,r=u):(a=d.outerWidth(),r=d.outerHeight()),m=(e.width-c)/a,l=(e.height-u)/r,s=d.offset()},move:function(o){var t=o.pageX-s.left,n=o.pageY-s.top;n=Math.max(Math.min(n,r),0),t=Math.max(Math.min(t,a),0),e.style.left=t*-m+"px",e.style.top=n*-l+"px"}}},o.fn.zoom=function(n){return this.each(function(){var e=o.extend({},t,n||{}),i=e.target&&o(e.target)[0]||this,u=this,c=o(u),r=document.createElement("img"),a=o(r),m="mousemove.zoom",l=!1,s=!1;if(!e.url){var f=u.querySelector("img");if(f&&(e.url=f.getAttribute("data-src")||f.currentSrc||f.src),!e.url)return}c.one("zoom.destroy",function(o,t){c.off(".zoom"),i.style.position=o,i.style.overflow=t,r.onload=null,a.remove()}.bind(this,i.style.position,i.style.overflow)),r.onload=function(){function t(t){f.init(),f.move(t),a.stop().fadeTo(o.support.opacity?e.duration:0,1,o.isFunction(e.onZoomIn)?e.onZoomIn.call(r):!1)}function n(){a.stop().fadeTo(e.duration,0,o.isFunction(e.onZoomOut)?e.onZoomOut.call(r):!1)}var f=o.zoom(i,u,r,e.magnify);"grab"===e.on?c.on("mousedown.zoom",function(e){1===e.which&&(o(document).one("mouseup.zoom",function(){n(),o(document).off(m,f.move)}),t(e),o(document).on(m,f.move),e.preventDefault())}):"click"===e.on?c.on("click.zoom",function(e){return l?void 0:(l=!0,t(e),o(document).on(m,f.move),o(document).one("click.zoom",function(){n(),l=!1,o(document).off(m,f.move)}),!1)}):"toggle"===e.on?c.on("click.zoom",function(o){l?n():t(o),l=!l}):"mouseover"===e.on&&(f.init(),c.on("mouseenter.zoom",t).on("mouseleave.zoom",n).on(m,f.move)),e.touch&&c.on("touchstart.zoom",function(o){o.preventDefault(),s?(s=!1,n()):(s=!0,t(o.originalEvent.touches[0]||o.originalEvent.changedTouches[0]))}).on("touchmove.zoom",function(o){o.preventDefault(),f.move(o.originalEvent.touches[0]||o.originalEvent.changedTouches[0])}).on("touchend.zoom",function(o){o.preventDefault(),s&&(s=!1,n())}),o.isFunction(e.callback)&&e.callback.call(r)},r.setAttribute("role","presentation"),r.src=e.url})},o.fn.zoom.defaults=t})(window.jQuery);
	},
	lightbox: function() {
		/*! Magnific Popup - v1.1.0 - 2016-02-20
		* http://dimsemenov.com/plugins/magnific-popup/
		* Copyright (c) 2016 Dmitry Semenov; */
		!function(a){"function"==typeof define&&define.amd?define(["jquery"],a):a("object"==typeof exports?require("jquery"):window.jQuery||window.Zepto)}(function(a){var b,c,d,e,f,g,h="Close",i="BeforeClose",j="AfterClose",k="BeforeAppend",l="MarkupParse",m="Open",n="Change",o="mfp",p="."+o,q="mfp-ready",r="mfp-removing",s="mfp-prevent-close",t=function(){},u=!!window.jQuery,v=a(window),w=function(a,c){b.ev.on(o+a+p,c)},x=function(b,c,d,e){var f=document.createElement("div");return f.className="mfp-"+b,d&&(f.innerHTML=d),e?c&&c.appendChild(f):(f=a(f),c&&f.appendTo(c)),f},y=function(c,d){b.ev.triggerHandler(o+c,d),b.st.callbacks&&(c=c.charAt(0).toLowerCase()+c.slice(1),b.st.callbacks[c]&&b.st.callbacks[c].apply(b,a.isArray(d)?d:[d]))},z=function(c){return c===g&&b.currTemplate.closeBtn||(b.currTemplate.closeBtn=a(b.st.closeMarkup.replace("%title%",b.st.tClose)),g=c),b.currTemplate.closeBtn},A=function(){a.magnificPopup.instance||(b=new t,b.init(),a.magnificPopup.instance=b)},B=function(){var a=document.createElement("p").style,b=["ms","O","Moz","Webkit"];if(void 0!==a.transition)return!0;for(;b.length;)if(b.pop()+"Transition"in a)return!0;return!1};t.prototype={constructor:t,init:function(){var c=navigator.appVersion;b.isLowIE=b.isIE8=document.all&&!document.addEventListener,b.isAndroid=/android/gi.test(c),b.isIOS=/iphone|ipad|ipod/gi.test(c),b.supportsTransition=B(),b.probablyMobile=b.isAndroid||b.isIOS||/(Opera Mini)|Kindle|webOS|BlackBerry|(Opera Mobi)|(Windows Phone)|IEMobile/i.test(navigator.userAgent),d=a(document),b.popupsCache={}},open:function(c){var e;if(c.isObj===!1){b.items=c.items.toArray(),b.index=0;var g,h=c.items;for(e=0;e<h.length;e++)if(g=h[e],g.parsed&&(g=g.el[0]),g===c.el[0]){b.index=e;break}}else b.items=a.isArray(c.items)?c.items:[c.items],b.index=c.index||0;if(b.isOpen)return void b.updateItemHTML();b.types=[],f="",c.mainEl&&c.mainEl.length?b.ev=c.mainEl.eq(0):b.ev=d,c.key?(b.popupsCache[c.key]||(b.popupsCache[c.key]={}),b.currTemplate=b.popupsCache[c.key]):b.currTemplate={},b.st=a.extend(!0,{},a.magnificPopup.defaults,c),b.fixedContentPos="auto"===b.st.fixedContentPos?!b.probablyMobile:b.st.fixedContentPos,b.st.modal&&(b.st.closeOnContentClick=!1,b.st.closeOnBgClick=!1,b.st.showCloseBtn=!1,b.st.enableEscapeKey=!1),b.bgOverlay||(b.bgOverlay=x("bg").on("click"+p,function(){b.close()}),b.wrap=x("wrap").attr("tabindex",-1).on("click"+p,function(a){b._checkIfClose(a.target)&&b.close()}),b.container=x("container",b.wrap)),b.contentContainer=x("content"),b.st.preloader&&(b.preloader=x("preloader",b.container,b.st.tLoading));var i=a.magnificPopup.modules;for(e=0;e<i.length;e++){var j=i[e];j=j.charAt(0).toUpperCase()+j.slice(1),b["init"+j].call(b)}y("BeforeOpen"),b.st.showCloseBtn&&(b.st.closeBtnInside?(w(l,function(a,b,c,d){c.close_replaceWith=z(d.type)}),f+=" mfp-close-btn-in"):b.wrap.append(z())),b.st.alignTop&&(f+=" mfp-align-top"),b.fixedContentPos?b.wrap.css({overflow:b.st.overflowY,overflowX:"hidden",overflowY:b.st.overflowY}):b.wrap.css({top:v.scrollTop(),position:"absolute"}),(b.st.fixedBgPos===!1||"auto"===b.st.fixedBgPos&&!b.fixedContentPos)&&b.bgOverlay.css({height:d.height(),position:"absolute"}),b.st.enableEscapeKey&&d.on("keyup"+p,function(a){27===a.keyCode&&b.close()}),v.on("resize"+p,function(){b.updateSize()}),b.st.closeOnContentClick||(f+=" mfp-auto-cursor"),f&&b.wrap.addClass(f);var k=b.wH=v.height(),n={};if(b.fixedContentPos&&b._hasScrollBar(k)){var o=b._getScrollbarSize();o&&(n.marginRight=o)}b.fixedContentPos&&(b.isIE7?a("body, html").css("overflow","hidden"):n.overflow="hidden");var r=b.st.mainClass;return b.isIE7&&(r+=" mfp-ie7"),r&&b._addClassToMFP(r),b.updateItemHTML(),y("BuildControls"),a("html").css(n),b.bgOverlay.add(b.wrap).prependTo(b.st.prependTo||a(document.body)),b._lastFocusedEl=document.activeElement,setTimeout(function(){b.content?(b._addClassToMFP(q),b._setFocus()):b.bgOverlay.addClass(q),d.on("focusin"+p,b._onFocusIn)},16),b.isOpen=!0,b.updateSize(k),y(m),c},close:function(){b.isOpen&&(y(i),b.isOpen=!1,b.st.removalDelay&&!b.isLowIE&&b.supportsTransition?(b._addClassToMFP(r),setTimeout(function(){b._close()},b.st.removalDelay)):b._close())},_close:function(){y(h);var c=r+" "+q+" ";if(b.bgOverlay.detach(),b.wrap.detach(),b.container.empty(),b.st.mainClass&&(c+=b.st.mainClass+" "),b._removeClassFromMFP(c),b.fixedContentPos){var e={marginRight:""};b.isIE7?a("body, html").css("overflow",""):e.overflow="",a("html").css(e)}d.off("keyup"+p+" focusin"+p),b.ev.off(p),b.wrap.attr("class","mfp-wrap").removeAttr("style"),b.bgOverlay.attr("class","mfp-bg"),b.container.attr("class","mfp-container"),!b.st.showCloseBtn||b.st.closeBtnInside&&b.currTemplate[b.currItem.type]!==!0||b.currTemplate.closeBtn&&b.currTemplate.closeBtn.detach(),b.st.autoFocusLast&&b._lastFocusedEl&&a(b._lastFocusedEl).focus(),b.currItem=null,b.content=null,b.currTemplate=null,b.prevHeight=0,y(j)},updateSize:function(a){if(b.isIOS){var c=document.documentElement.clientWidth/window.innerWidth,d=window.innerHeight*c;b.wrap.css("height",d),b.wH=d}else b.wH=a||v.height();b.fixedContentPos||b.wrap.css("height",b.wH),y("Resize")},updateItemHTML:function(){var c=b.items[b.index];b.contentContainer.detach(),b.content&&b.content.detach(),c.parsed||(c=b.parseEl(b.index));var d=c.type;if(y("BeforeChange",[b.currItem?b.currItem.type:"",d]),b.currItem=c,!b.currTemplate[d]){var f=b.st[d]?b.st[d].markup:!1;y("FirstMarkupParse",f),f?b.currTemplate[d]=a(f):b.currTemplate[d]=!0}e&&e!==c.type&&b.container.removeClass("mfp-"+e+"-holder");var g=b["get"+d.charAt(0).toUpperCase()+d.slice(1)](c,b.currTemplate[d]);b.appendContent(g,d),c.preloaded=!0,y(n,c),e=c.type,b.container.prepend(b.contentContainer),y("AfterChange")},appendContent:function(a,c){b.content=a,a?b.st.showCloseBtn&&b.st.closeBtnInside&&b.currTemplate[c]===!0?b.content.find(".mfp-close").length||b.content.append(z()):b.content=a:b.content="",y(k),b.container.addClass("mfp-"+c+"-holder"),b.contentContainer.append(b.content)},parseEl:function(c){var d,e=b.items[c];if(e.tagName?e={el:a(e)}:(d=e.type,e={data:e,src:e.src}),e.el){for(var f=b.types,g=0;g<f.length;g++)if(e.el.hasClass("mfp-"+f[g])){d=f[g];break}e.src=e.el.attr("data-mfp-src"),e.src||(e.src=e.el.attr("href"))}return e.type=d||b.st.type||"inline",e.index=c,e.parsed=!0,b.items[c]=e,y("ElementParse",e),b.items[c]},addGroup:function(a,c){var d=function(d){d.mfpEl=this,b._openClick(d,a,c)};c||(c={});var e="click.magnificPopup";c.mainEl=a,c.items?(c.isObj=!0,a.off(e).on(e,d)):(c.isObj=!1,c.delegate?a.off(e).on(e,c.delegate,d):(c.items=a,a.off(e).on(e,d)))},_openClick:function(c,d,e){var f=void 0!==e.midClick?e.midClick:a.magnificPopup.defaults.midClick;if(f||!(2===c.which||c.ctrlKey||c.metaKey||c.altKey||c.shiftKey)){var g=void 0!==e.disableOn?e.disableOn:a.magnificPopup.defaults.disableOn;if(g)if(a.isFunction(g)){if(!g.call(b))return!0}else if(v.width()<g)return!0;c.type&&(c.preventDefault(),b.isOpen&&c.stopPropagation()),e.el=a(c.mfpEl),e.delegate&&(e.items=d.find(e.delegate)),b.open(e)}},updateStatus:function(a,d){if(b.preloader){c!==a&&b.container.removeClass("mfp-s-"+c),d||"loading"!==a||(d=b.st.tLoading);var e={status:a,text:d};y("UpdateStatus",e),a=e.status,d=e.text,b.preloader.html(d),b.preloader.find("a").on("click",function(a){a.stopImmediatePropagation()}),b.container.addClass("mfp-s-"+a),c=a}},_checkIfClose:function(c){if(!a(c).hasClass(s)){var d=b.st.closeOnContentClick,e=b.st.closeOnBgClick;if(d&&e)return!0;if(!b.content||a(c).hasClass("mfp-close")||b.preloader&&c===b.preloader[0])return!0;if(c===b.content[0]||a.contains(b.content[0],c)){if(d)return!0}else if(e&&a.contains(document,c))return!0;return!1}},_addClassToMFP:function(a){b.bgOverlay.addClass(a),b.wrap.addClass(a)},_removeClassFromMFP:function(a){this.bgOverlay.removeClass(a),b.wrap.removeClass(a)},_hasScrollBar:function(a){return(b.isIE7?d.height():document.body.scrollHeight)>(a||v.height())},_setFocus:function(){(b.st.focus?b.content.find(b.st.focus).eq(0):b.wrap).focus()},_onFocusIn:function(c){return c.target===b.wrap[0]||a.contains(b.wrap[0],c.target)?void 0:(b._setFocus(),!1)},_parseMarkup:function(b,c,d){var e;d.data&&(c=a.extend(d.data,c)),y(l,[b,c,d]),a.each(c,function(c,d){if(void 0===d||d===!1)return!0;if(e=c.split("_"),e.length>1){var f=b.find(p+"-"+e[0]);if(f.length>0){var g=e[1];"replaceWith"===g?f[0]!==d[0]&&f.replaceWith(d):"img"===g?f.is("img")?f.attr("src",d):f.replaceWith(a("<img>").attr("src",d).attr("class",f.attr("class"))):f.attr(e[1],d)}}else b.find(p+"-"+c).html(d)})},_getScrollbarSize:function(){if(void 0===b.scrollbarSize){var a=document.createElement("div");a.style.cssText="width: 99px; height: 99px; overflow: scroll; position: absolute; top: -9999px;",document.body.appendChild(a),b.scrollbarSize=a.offsetWidth-a.clientWidth,document.body.removeChild(a)}return b.scrollbarSize}},a.magnificPopup={instance:null,proto:t.prototype,modules:[],open:function(b,c){return A(),b=b?a.extend(!0,{},b):{},b.isObj=!0,b.index=c||0,this.instance.open(b)},close:function(){return a.magnificPopup.instance&&a.magnificPopup.instance.close()},registerModule:function(b,c){c.options&&(a.magnificPopup.defaults[b]=c.options),a.extend(this.proto,c.proto),this.modules.push(b)},defaults:{disableOn:0,key:null,midClick:!1,mainClass:"",preloader:!0,focus:"",closeOnContentClick:!1,closeOnBgClick:!0,closeBtnInside:!0,showCloseBtn:!0,enableEscapeKey:!0,modal:!1,alignTop:!1,removalDelay:0,prependTo:null,fixedContentPos:"auto",fixedBgPos:"auto",overflowY:"auto",closeMarkup:'<button title="%title%" type="button" class="mfp-close">&#215;</button>',tClose:"Close (Esc)",tLoading:"Loading...",autoFocusLast:!0}},a.fn.magnificPopup=function(c){A();var d=a(this);if("string"==typeof c)if("open"===c){var e,f=u?d.data("magnificPopup"):d[0].magnificPopup,g=parseInt(arguments[1],10)||0;f.items?e=f.items[g]:(e=d,f.delegate&&(e=e.find(f.delegate)),e=e.eq(g)),b._openClick({mfpEl:e},d,f)}else b.isOpen&&b[c].apply(b,Array.prototype.slice.call(arguments,1));else c=a.extend(!0,{},c),u?d.data("magnificPopup",c):d[0].magnificPopup=c,b.addGroup(d,c);return d};var C,D,E,F="inline",G=function(){E&&(D.after(E.addClass(C)).detach(),E=null)};a.magnificPopup.registerModule(F,{options:{hiddenClass:"hide",markup:"",tNotFound:"Content not found"},proto:{initInline:function(){b.types.push(F),w(h+"."+F,function(){G()})},getInline:function(c,d){if(G(),c.src){var e=b.st.inline,f=a(c.src);if(f.length){var g=f[0].parentNode;g&&g.tagName&&(D||(C=e.hiddenClass,D=x(C),C="mfp-"+C),E=f.after(D).detach().removeClass(C)),b.updateStatus("ready")}else b.updateStatus("error",e.tNotFound),f=a("<div>");return c.inlineElement=f,f}return b.updateStatus("ready"),b._parseMarkup(d,{},c),d}}});var H,I="ajax",J=function(){H&&a(document.body).removeClass(H)},K=function(){J(),b.req&&b.req.abort()};a.magnificPopup.registerModule(I,{options:{settings:null,cursor:"mfp-ajax-cur",tError:'<a href="%url%">The content</a> could not be loaded.'},proto:{initAjax:function(){b.types.push(I),H=b.st.ajax.cursor,w(h+"."+I,K),w("BeforeChange."+I,K)},getAjax:function(c){H&&a(document.body).addClass(H),b.updateStatus("loading");var d=a.extend({url:c.src,success:function(d,e,f){var g={data:d,xhr:f};y("ParseAjax",g),b.appendContent(a(g.data),I),c.finished=!0,J(),b._setFocus(),setTimeout(function(){b.wrap.addClass(q)},16),b.updateStatus("ready"),y("AjaxContentAdded")},error:function(){J(),c.finished=c.loadError=!0,b.updateStatus("error",b.st.ajax.tError.replace("%url%",c.src))}},b.st.ajax.settings);return b.req=a.ajax(d),""}}});var L,M=function(c){if(c.data&&void 0!==c.data.title)return c.data.title;var d=b.st.image.titleSrc;if(d){if(a.isFunction(d))return d.call(b,c);if(c.el)return c.el.attr(d)||""}return""};a.magnificPopup.registerModule("image",{options:{markup:'<div class="mfp-figure"><div class="mfp-close"></div><figure><div class="mfp-img"></div><figcaption><div class="mfp-bottom-bar"><div class="mfp-title"></div><div class="mfp-counter"></div></div></figcaption></figure></div>',cursor:"mfp-zoom-out-cur",titleSrc:"title",verticalFit:!0,tError:'<a href="%url%">The image</a> could not be loaded.'},proto:{initImage:function(){var c=b.st.image,d=".image";b.types.push("image"),w(m+d,function(){"image"===b.currItem.type&&c.cursor&&a(document.body).addClass(c.cursor)}),w(h+d,function(){c.cursor&&a(document.body).removeClass(c.cursor),v.off("resize"+p)}),w("Resize"+d,b.resizeImage),b.isLowIE&&w("AfterChange",b.resizeImage)},resizeImage:function(){var a=b.currItem;if(a&&a.img&&b.st.image.verticalFit){var c=0;b.isLowIE&&(c=parseInt(a.img.css("padding-top"),10)+parseInt(a.img.css("padding-bottom"),10)),a.img.css("max-height",b.wH-c)}},_onImageHasSize:function(a){a.img&&(a.hasSize=!0,L&&clearInterval(L),a.isCheckingImgSize=!1,y("ImageHasSize",a),a.imgHidden&&(b.content&&b.content.removeClass("mfp-loading"),a.imgHidden=!1))},findImageSize:function(a){var c=0,d=a.img[0],e=function(f){L&&clearInterval(L),L=setInterval(function(){return d.naturalWidth>0?void b._onImageHasSize(a):(c>200&&clearInterval(L),c++,void(3===c?e(10):40===c?e(50):100===c&&e(500)))},f)};e(1)},getImage:function(c,d){var e=0,f=function(){c&&(c.img[0].complete?(c.img.off(".mfploader"),c===b.currItem&&(b._onImageHasSize(c),b.updateStatus("ready")),c.hasSize=!0,c.loaded=!0,y("ImageLoadComplete")):(e++,200>e?setTimeout(f,100):g()))},g=function(){c&&(c.img.off(".mfploader"),c===b.currItem&&(b._onImageHasSize(c),b.updateStatus("error",h.tError.replace("%url%",c.src))),c.hasSize=!0,c.loaded=!0,c.loadError=!0)},h=b.st.image,i=d.find(".mfp-img");if(i.length){var j=document.createElement("img");j.className="mfp-img",c.el&&c.el.find("img").length&&(j.alt=c.el.find("img").attr("alt")),c.img=a(j).on("load.mfploader",f).on("error.mfploader",g),j.src=c.src,i.is("img")&&(c.img=c.img.clone()),j=c.img[0],j.naturalWidth>0?c.hasSize=!0:j.width||(c.hasSize=!1)}return b._parseMarkup(d,{title:M(c),img_replaceWith:c.img},c),b.resizeImage(),c.hasSize?(L&&clearInterval(L),c.loadError?(d.addClass("mfp-loading"),b.updateStatus("error",h.tError.replace("%url%",c.src))):(d.removeClass("mfp-loading"),b.updateStatus("ready")),d):(b.updateStatus("loading"),c.loading=!0,c.hasSize||(c.imgHidden=!0,d.addClass("mfp-loading"),b.findImageSize(c)),d)}}});var N,O=function(){return void 0===N&&(N=void 0!==document.createElement("p").style.MozTransform),N};a.magnificPopup.registerModule("zoom",{options:{enabled:!1,easing:"ease-in-out",duration:300,opener:function(a){return a.is("img")?a:a.find("img")}},proto:{initZoom:function(){var a,c=b.st.zoom,d=".zoom";if(c.enabled&&b.supportsTransition){var e,f,g=c.duration,j=function(a){var b=a.clone().removeAttr("style").removeAttr("class").addClass("mfp-animated-image"),d="all "+c.duration/1e3+"s "+c.easing,e={position:"fixed",zIndex:9999,left:0,top:0,"-webkit-backface-visibility":"hidden"},f="transition";return e["-webkit-"+f]=e["-moz-"+f]=e["-o-"+f]=e[f]=d,b.css(e),b},k=function(){b.content.css("visibility","visible")};w("BuildControls"+d,function(){if(b._allowZoom()){if(clearTimeout(e),b.content.css("visibility","hidden"),a=b._getItemToZoom(),!a)return void k();f=j(a),f.css(b._getOffset()),b.wrap.append(f),e=setTimeout(function(){f.css(b._getOffset(!0)),e=setTimeout(function(){k(),setTimeout(function(){f.remove(),a=f=null,y("ZoomAnimationEnded")},16)},g)},16)}}),w(i+d,function(){if(b._allowZoom()){if(clearTimeout(e),b.st.removalDelay=g,!a){if(a=b._getItemToZoom(),!a)return;f=j(a)}f.css(b._getOffset(!0)),b.wrap.append(f),b.content.css("visibility","hidden"),setTimeout(function(){f.css(b._getOffset())},16)}}),w(h+d,function(){b._allowZoom()&&(k(),f&&f.remove(),a=null)})}},_allowZoom:function(){return"image"===b.currItem.type},_getItemToZoom:function(){return b.currItem.hasSize?b.currItem.img:!1},_getOffset:function(c){var d;d=c?b.currItem.img:b.st.zoom.opener(b.currItem.el||b.currItem);var e=d.offset(),f=parseInt(d.css("padding-top"),10),g=parseInt(d.css("padding-bottom"),10);e.top-=a(window).scrollTop()-f;var h={width:d.width(),height:(u?d.innerHeight():d[0].offsetHeight)-g-f};return O()?h["-moz-transform"]=h.transform="translate("+e.left+"px,"+e.top+"px)":(h.left=e.left,h.top=e.top),h}}});var P="iframe",Q="//about:blank",R=function(a){if(b.currTemplate[P]){var c=b.currTemplate[P].find("iframe");c.length&&(a||(c[0].src=Q),b.isIE8&&c.css("display",a?"block":"none"))}};a.magnificPopup.registerModule(P,{options:{markup:'<div class="mfp-iframe-scaler"><div class="mfp-close"></div><iframe class="mfp-iframe" src="//about:blank" frameborder="0" allowfullscreen></iframe></div>',srcAction:"iframe_src",patterns:{youtube:{index:"youtube.com",id:"v=",src:"//www.youtube.com/embed/%id%?autoplay=1"},vimeo:{index:"vimeo.com/",id:"/",src:"//player.vimeo.com/video/%id%?autoplay=1"},gmaps:{index:"//maps.google.",src:"%id%&output=embed"}}},proto:{initIframe:function(){b.types.push(P),w("BeforeChange",function(a,b,c){b!==c&&(b===P?R():c===P&&R(!0))}),w(h+"."+P,function(){R()})},getIframe:function(c,d){var e=c.src,f=b.st.iframe;a.each(f.patterns,function(){return e.indexOf(this.index)>-1?(this.id&&(e="string"==typeof this.id?e.substr(e.lastIndexOf(this.id)+this.id.length,e.length):this.id.call(this,e)),e=this.src.replace("%id%",e),!1):void 0});var g={};return f.srcAction&&(g[f.srcAction]=e),b._parseMarkup(d,g,c),b.updateStatus("ready"),d}}});var S=function(a){var c=b.items.length;return a>c-1?a-c:0>a?c+a:a},T=function(a,b,c){return a.replace(/%curr%/gi,b+1).replace(/%total%/gi,c)};a.magnificPopup.registerModule("gallery",{options:{enabled:!1,arrowMarkup:'<button title="%title%" type="button" class="mfp-arrow mfp-arrow-%dir%"></button>',preload:[0,2],navigateByImgClick:!0,arrows:!0,tPrev:"Previous (Left arrow key)",tNext:"Next (Right arrow key)",tCounter:"%curr% of %total%"},proto:{initGallery:function(){var c=b.st.gallery,e=".mfp-gallery";return b.direction=!0,c&&c.enabled?(f+=" mfp-gallery",w(m+e,function(){c.navigateByImgClick&&b.wrap.on("click"+e,".mfp-img",function(){return b.items.length>1?(b.next(),!1):void 0}),d.on("keydown"+e,function(a){37===a.keyCode?b.prev():39===a.keyCode&&b.next()})}),w("UpdateStatus"+e,function(a,c){c.text&&(c.text=T(c.text,b.currItem.index,b.items.length))}),w(l+e,function(a,d,e,f){var g=b.items.length;e.counter=g>1?T(c.tCounter,f.index,g):""}),w("BuildControls"+e,function(){if(b.items.length>1&&c.arrows&&!b.arrowLeft){var d=c.arrowMarkup,e=b.arrowLeft=a(d.replace(/%title%/gi,c.tPrev).replace(/%dir%/gi,"left")).addClass(s),f=b.arrowRight=a(d.replace(/%title%/gi,c.tNext).replace(/%dir%/gi,"right")).addClass(s);e.click(function(){b.prev()}),f.click(function(){b.next()}),b.container.append(e.add(f))}}),w(n+e,function(){b._preloadTimeout&&clearTimeout(b._preloadTimeout),b._preloadTimeout=setTimeout(function(){b.preloadNearbyImages(),b._preloadTimeout=null},16)}),void w(h+e,function(){d.off(e),b.wrap.off("click"+e),b.arrowRight=b.arrowLeft=null})):!1},next:function(){b.direction=!0,b.index=S(b.index+1),b.updateItemHTML()},prev:function(){b.direction=!1,b.index=S(b.index-1),b.updateItemHTML()},goTo:function(a){b.direction=a>=b.index,b.index=a,b.updateItemHTML()},preloadNearbyImages:function(){var a,c=b.st.gallery.preload,d=Math.min(c[0],b.items.length),e=Math.min(c[1],b.items.length);for(a=1;a<=(b.direction?e:d);a++)b._preloadItem(b.index+a);for(a=1;a<=(b.direction?d:e);a++)b._preloadItem(b.index-a)},_preloadItem:function(c){if(c=S(c),!b.items[c].preloaded){var d=b.items[c];d.parsed||(d=b.parseEl(c)),y("LazyLoad",d),"image"===d.type&&(d.img=a('<img class="mfp-img" />').on("load.mfploader",function(){d.hasSize=!0}).on("error.mfploader",function(){d.hasSize=!0,d.loadError=!0,y("LazyLoadError",d)}).attr("src",d.src)),d.preloaded=!0}}}});var U="retina";a.magnificPopup.registerModule(U,{options:{replaceSrc:function(a){return a.src.replace(/\.\w+$/,function(a){return"@2x"+a})},ratio:1},proto:{initRetina:function(){if(window.devicePixelRatio>1){var a=b.st.retina,c=a.ratio;c=isNaN(c)?c():c,c>1&&(w("ImageHasSize."+U,function(a,b){b.img.css({"max-width":b.img[0].naturalWidth/c,width:"100%"})}),w("ElementParse."+U,function(b,d){d.src=a.replaceSrc(d,c)}))}}}}),A()});
	},
	popup: function() {
		/*
			A simple jQuery modal (http://github.com/kylefox/jquery-modal)
			Version 0.6.1
		*/
		!function(o){var t=null;o.modal=function(e,i){o.modal.close();var s,l;if(this.$body=o("body"),this.options=o.extend({},o.modal.defaults,i),this.options.doFade=!isNaN(parseInt(this.options.fadeDuration,10)),e.is("a"))if(l=e.attr("href"),/^#/.test(l)){if(this.$elm=o(l),1!==this.$elm.length)return null;this.$body.append(this.$elm),this.open()}else this.$elm=o("<div>"),this.$body.append(this.$elm),s=function(o,t){t.elm.remove()},this.showSpinner(),e.trigger(o.modal.AJAX_SEND),o.get(l).done(function(i){t&&(e.trigger(o.modal.AJAX_SUCCESS),t.$elm.empty().append(i).on(o.modal.CLOSE,s),t.hideSpinner(),t.open(),e.trigger(o.modal.AJAX_COMPLETE))}).fail(function(){e.trigger(o.modal.AJAX_FAIL),t.hideSpinner(),e.trigger(o.modal.AJAX_COMPLETE)});else this.$elm=e,this.$body.append(this.$elm),this.open()},o.modal.prototype={constructor:o.modal,open:function(){var t=this;this.options.doFade?(this.block(),setTimeout(function(){t.show()},this.options.fadeDuration*this.options.fadeDelay)):(this.block(),this.show()),this.options.escapeClose&&o(document).on("keydown.modal",function(t){27==t.which&&o.modal.close()}),this.options.clickClose&&this.blocker.click(function(t){t.target==this&&o.modal.close()})},close:function(){this.unblock(),this.hide(),o(document).off("keydown.modal")},block:function(){this.$elm.trigger(o.modal.BEFORE_BLOCK,[this._ctx()]),this.blocker=o('<div class="jquery-modal blocker"></div>'),this.$body.css("overflow","hidden"),this.$body.append(this.blocker),this.options.doFade&&this.blocker.css("opacity",0).animate({opacity:1},this.options.fadeDuration),this.$elm.trigger(o.modal.BLOCK,[this._ctx()])},unblock:function(){if(this.options.doFade){var o=this;this.blocker.fadeOut(this.options.fadeDuration,function(){o.blocker.children().appendTo(o.$body),o.blocker.remove(),o.$body.css("overflow","")})}else this.blocker.children().appendTo(this.$body),this.blocker.remove(),this.$body.css("overflow","")},show:function(){this.$elm.trigger(o.modal.BEFORE_OPEN,[this._ctx()]),this.options.showClose&&(this.closeButton=o('<a href="#close-modal" rel="modal:close" class="close-modal '+this.options.closeClass+'">'+this.options.closeText+"</a>"),this.$elm.append(this.closeButton)),this.$elm.addClass(this.options.modalClass+" current"),this.$elm.appendTo(this.blocker),this.options.doFade?this.$elm.css("opacity",0).show().animate({opacity:1},this.options.fadeDuration):this.$elm.show(),this.$elm.trigger(o.modal.OPEN,[this._ctx()])},hide:function(){this.$elm.trigger(o.modal.BEFORE_CLOSE,[this._ctx()]),this.closeButton&&this.closeButton.remove(),this.$elm.removeClass("current");var t=this;this.options.doFade?this.$elm.fadeOut(this.options.fadeDuration,function(){t.$elm.trigger(o.modal.AFTER_CLOSE,[t._ctx()])}):this.$elm.hide(0,function(){t.$elm.trigger(o.modal.AFTER_CLOSE,[t._ctx()])}),this.$elm.trigger(o.modal.CLOSE,[this._ctx()])},showSpinner:function(){this.options.showSpinner&&(this.spinner=this.spinner||o('<div class="'+this.options.modalClass+'-spinner"></div>').append(this.options.spinnerHtml),this.$body.append(this.spinner),this.spinner.show())},hideSpinner:function(){this.spinner&&this.spinner.remove()},_ctx:function(){return{elm:this.$elm,blocker:this.blocker,options:this.options}}},o.modal.close=function(o){if(t){o&&o.preventDefault(),t.close();var e=t.$elm;return t=null,e}},o.modal.isActive=function(){return t?!0:!1},o.modal.defaults={escapeClose:!0,clickClose:!0,closeText:"",closeClass:"",modalClass:"modal",spinnerHtml:null,showSpinner:!0,showClose:!0,fadeDuration:null,fadeDelay:1},o.modal.BEFORE_BLOCK="modal:before-block",o.modal.BLOCK="modal:block",o.modal.BEFORE_OPEN="modal:before-open",o.modal.OPEN="modal:open",o.modal.BEFORE_CLOSE="modal:before-close",o.modal.CLOSE="modal:close",o.modal.AFTER_CLOSE="modal:after-close",o.modal.AJAX_SEND="modal:ajax:send",o.modal.AJAX_SUCCESS="modal:ajax:success",o.modal.AJAX_FAIL="modal:ajax:fail",o.modal.AJAX_COMPLETE="modal:ajax:complete",o.fn.modal=function(e){return 1===this.length&&(t=new o.modal(this,e)),this},o(document).on("click.modal",'a[rel="modal:close"]',o.modal.close),o(document).on("click.modal",'a[rel="modal:open"]',function(t){t.preventDefault(),o(this).modal()})}(jQuery);  
	},
	cookie: function() {
		/*!
		 * JavaScript Cookie v2.1.0
		 * https://github.com/js-cookie/js-cookie
		 *
		 * Copyright 2006, 2015 Klaus Hartl & Fagner Brack
		 * Released under the MIT license
		 */

		!function(e){if("function"==typeof define&&define.amd)define(e);else if("object"==typeof exports)module.exports=e();else{var n=window.Cookies,t=window.Cookies=e();t.noConflict=function(){return window.Cookies=n,t}}}(function(){function e(){for(var e=0,n={};e<arguments.length;e++){var t=arguments[e];for(var o in t)n[o]=t[o]}return n}function n(t){function o(n,r,i){var c;if(arguments.length>1){if(i=e({path:"/"},o.defaults,i),"number"==typeof i.expires){var s=new Date;s.setMilliseconds(s.getMilliseconds()+864e5*i.expires),i.expires=s}try{c=JSON.stringify(r),/^[\{\[]/.test(c)&&(r=c)}catch(a){}return r=t.write?t.write(r,n):encodeURIComponent(String(r)).replace(/%(23|24|26|2B|3A|3C|3E|3D|2F|3F|40|5B|5D|5E|60|7B|7D|7C)/g,decodeURIComponent),n=encodeURIComponent(String(n)),n=n.replace(/%(23|24|26|2B|5E|60|7C)/g,decodeURIComponent),n=n.replace(/[\(\)]/g,escape),document.cookie=[n,"=",r,i.expires&&"; expires="+i.expires.toUTCString(),i.path&&"; path="+i.path,i.domain&&"; domain="+i.domain,i.secure?"; secure":""].join("")}n||(c={});for(var p=document.cookie?document.cookie.split("; "):[],d=/(%[0-9A-Z]{2})+/g,u=0;u<p.length;u++){var f=p[u].split("="),l=f[0].replace(d,decodeURIComponent),m=f.slice(1).join("=");'"'===m.charAt(0)&&(m=m.slice(1,-1));try{if(m=t.read?t.read(m,l):t(m,l)||m.replace(d,decodeURIComponent),this.json)try{m=JSON.parse(m)}catch(a){}if(n===l){c=m;break}n||(c[l]=m)}catch(a){}}return c}return o.get=o.set=o,o.getJSON=function(){return o.apply({json:!0},[].slice.call(arguments))},o.defaults={},o.remove=function(n,t){o(n,"",e(t,{expires:-1}))},o.withConverter=n,o}return n(function(){})});
	}
}

var Insta = {
	init: function() {
		function getDateFormat(timestamp) {
			var date = new Date( timestamp * 1000 );
			var months = "January, February, March, April, May, June, July, August, September, October, November, December";
			months = months.split(', ');

			return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
		}

		if( $('.js-instafeed').length ) {
			$('.js-instafeed').each(function() {
				var instaFeed = $(this);
				var featuredClass = 'instagram-img__wrapper';
				var enableFeaturedImage = $(this).data( 'featured-image' );
				if (enableFeaturedImage){
					var featuredClass = 'instagram-img__wrapper--featured';
				}
				var error = $(this).find('.js-fallback');
				var options = {};
				var slides = '';
				var valencia = window.valencia.default;
				var token = $(this).attr( 'data-insta-token' );
				var count = $(this).attr( 'data-insta-count' ) || 5;
				var template = '<div class="instagram-img__wrapper %%featuredClass%%">\
									<a style="background-image:url(%%img%%);" class="instagram-img" target="_blank" href="%%link%%">\
										<div class="instagram-img__overlay">\
											<div class="instagram-img__content">\
												<div class="instagram__logo"><span class="icon-instagram"></span></div>\
												<p class="instagram-img__likes">%%likes%% likes</p>\
												<p class="instagram-img__date">%%date%%</p>\
												<p class="instagram-img__caption">%%caption%%</p>\
											</div>\
										</div>\
									</a>\
								</div>';


				if( instaFeed.hasClass( 'insta-loaded' ) ) {

				}else {
					var feed = valencia( {
						token: token,
						count: count
					}, function( data ) {
						if( !data.images ) {
							return console.warn( 'Bad Instagram API request.' );
						}

						data.images.forEach( function( a, index ) {
							if ( enableFeaturedImage ) {
								featuredClass = index == 0 ? featuredClass : '';
							}

							var caption = '';
							if (a.caption != null){
								var caption = a.caption.text;
							} 

							slides += template
										.replace( '%%featuredClass%%', featuredClass )
										.replace( '%%link%%', a.link )
										.replace( '%%likes%%', a.likes.count )
										.replace( '%%caption%%', caption )
										.replace( '%%date%%', getDateFormat(a.created_time) )
										.replace( '%%img%%', '\''+a.images.standard_resolution.url+'\'' );
						} );


						instaFeed.html( slides );
						instaFeed.addClass( 'insta-loaded' );
					} );
				}
			});
		}
	}
}


var FeaturedProduct = {
	init: function() {
		$("section[data-section-type='featured-product']").each( function () {
			var section = $(this);

			if(!$(section).hasClass('fp-initialized') && !$(section).hasClass('onboarding-product')){
				var id = $(section).data('section-id');
				var productJSON = $(section).find('#product-json').text();
				var product = JSON.parse(productJSON);
				var enableColorSwatches = $('.productForm').data('color_swatches');

				selectCallback = function(variant, selector) {
					Product.callback({
					  money_format: "",
					  variant: variant,
					  selector: selector
					});

					// BEGIN SWATCHES
					if (enableColorSwatches) {
						ColorSwatches.init(variant, selector);
					}
					// END SWATCHES
				};

				/**
				 * Reinitialize variant dropdown.
				 */
				var selectorClass = 'product-select--'+id;
				new Shopify.OptionSelectors(selectorClass, {
					product: product,
					onVariantSelected: selectCallback
				});

				manageOptions( product, id );

				function manageOptions( obj,id ){
				  if (obj['options'].length === 1 && obj['variants'].length){
					if (obj['variants'][0].title === 'Default Title') {
					  for (i = 0; i < obj['options'].length; i++) {
						$('#product-select--'+id+'-option-'+[i]).closest('.productForm-block').hide();
					  }
					} else {
					  for (i = 0; i < obj['options'].length; i++) {
						$('#product-select--'+id+'-option-'+[i]).closest('.selector-wrapper').attr('data-id', 'product-select-option-'+[i]).prepend('<span class="selectArrow"></span><label>'+obj['options'][0]+'</label>');
					  }
					}
				  } else if (obj['options'].length > 1){
					for (i = 0; i < obj['options'].length; i++) {
					  $('#product-select--'+id+'-option-'+[i]).closest('.selector-wrapper').attr('data-id', 'product-select-option-'+[i]).prepend('<span class="selectArrow"></span>');
					}
				  }

				  $('.featured-product--'+id).addClass('fp-initialized');
				}

				if (enableColorSwatches) {
					ColorSwatches.bind(section);
				}

				var $productImgSlider = section.find('.js-productImgSlider');
				var $productImgSliderNav = section.find('.js-productImgSlider-nav');
				var sliderId = '#' + $productImgSlider.attr('id');
				var activeArrows = $productImgSlider.data('arrows');
				var activeDots = $productImgSlider.data('dots');
				var sliderNavArrows = $productImgSliderNav.find('.js-slide').length > 3;
				var activeSlide = $productImgSlider.find('.is-selected-product').index();

				activeSlide = activeSlide == -1 ? 0 : activeSlide;

				if ( $productImgSlider.find('.js-slide').length > 1 ) {
					$productImgSlider.flickity({
						cellSelector: '.js-slide',
						prevNextButtons: activeArrows,
						arrowShape: 'M 69.65625 6.96875 A 3.0003 3.0003 0 0 0 67.875 7.875 L 27.875 47.875 A 3.0003 3.0003 0 0 0 27.875 52.09375 L 67.875 92.09375 A 3.0003 3.0003 0 1 0 72.125 87.875 L 34.25 50 L 72.125 12.09375 A 3.0003 3.0003 0 0 0 69.65625 6.96875 z',
						pageDots: activeDots,
						initialIndex: activeSlide,
						selectedAttraction: 0.08,
						friction: 0.8,
						adaptiveHeight: true,
						contain: true
					});

					$productImgSlider.on('change.flickity', Site.setBadgePosition);

					$productImgSliderNav.flickity({
						cellSelector: '.js-slide',
						asNavFor: sliderId,
						initialIndex: activeSlide,
						pageDots: false,
						prevNextButtons: sliderNavArrows,
						arrowShape: 'M 69.65625 6.96875 A 3.0003 3.0003 0 0 0 67.875 7.875 L 27.875 47.875 A 3.0003 3.0003 0 0 0 27.875 52.09375 L 67.875 92.09375 A 3.0003 3.0003 0 1 0 72.125 87.875 L 34.25 50 L 72.125 12.09375 A 3.0003 3.0003 0 0 0 69.65625 6.96875 z',
						contain: true
					});

					$productImgSliderNav.on('click', 'a', function(e) {
						e.preventDefault();
					});
				}

				Product.setSlidesHeight($productImgSlider);
				$(window).resize(
					Reqs.debounce(function(event){
						Product.setSlidesHeight($productImgSlider)
				}, 250));

			} else {
				return;
			}

		});

		if ( typeof(Currency) != 'undefined' && Currency ){
		    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
		    onCurrencySet();
		}
	}
}

var Gmap = {
	init: function( ) {

		$("div[data-section-type='map']").each( function () {

			var target = $(this);
			var key = $(target).data('key');
			
			$.getScript(
				  'https://maps.googleapis.com/maps/api/js?key=' + key
				).then(function() {
				  createMap(target);
			});

			function createMap(container){
			  var style = $(container).data('style');
			  var zoom = $(container).data('zoom');
			  var id = $(container).data('section-id');
			  var address = $(container).data('address');
			  var map = new GMaps({
				  div: '.map--'+id,
				  lat: 37.4439064,
				  lng: -122.1639733,
				  navigationControl: false,
				  mapTypeControl: false,
				  scaleControl: false,
				  draggable: false,
				  zoom: zoom
			  });

				var standard =[];
				var silver =[{"elementType":"geometry","stylers":[{"color":"#f5f5f5"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#f5f5f5"}]},{"featureType":"administrative.land_parcel","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#ffffff"}]},{"featureType":"road.arterial","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#dadada"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"transit.line","elementType":"geometry","stylers":[{"color":"#e5e5e5"}]},{"featureType":"transit.station","elementType":"geometry","stylers":[{"color":"#eeeeee"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#c9c9c9"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]}];
				var retro =[{"elementType":"geometry","stylers":[{"color":"#ebe3cd"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#523735"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#f5f1e6"}]},{"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#c9b2a6"}]},{"featureType":"administrative.land_parcel","elementType":"geometry.stroke","stylers":[{"color":"#dcd2be"}]},{"featureType":"administrative.land_parcel","elementType":"labels.text.fill","stylers":[{"color":"#ae9e90"}]},{"featureType":"landscape.natural","elementType":"geometry","stylers":[{"color":"#dfd2ae"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#dfd2ae"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#93817c"}]},{"featureType":"poi.park","elementType":"geometry.fill","stylers":[{"color":"#a5b076"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#447530"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#f5f1e6"}]},{"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#fdfcf8"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#f8c967"}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#e9bc62"}]},{"featureType":"road.highway.controlled_access","elementType":"geometry","stylers":[{"color":"#e98d58"}]},{"featureType":"road.highway.controlled_access","elementType":"geometry.stroke","stylers":[{"color":"#db8555"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#806b63"}]},{"featureType":"transit.line","elementType":"geometry","stylers":[{"color":"#dfd2ae"}]},{"featureType":"transit.line","elementType":"labels.text.fill","stylers":[{"color":"#8f7d77"}]},{"featureType":"transit.line","elementType":"labels.text.stroke","stylers":[{"color":"#ebe3cd"}]},{"featureType":"transit.station","elementType":"geometry","stylers":[{"color":"#dfd2ae"}]},{"featureType":"water","elementType":"geometry.fill","stylers":[{"color":"#b9d3c2"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#92998d"}]}];
				var dark =[{"elementType":"geometry","stylers":[{"color":"#212121"}]},{"elementType":"labels.icon","stylers":[{"visibility":"off"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#212121"}]},{"featureType":"administrative","elementType":"geometry","stylers":[{"color":"#757575"}]},{"featureType":"administrative.country","elementType":"labels.text.fill","stylers":[{"color":"#9e9e9e"}]},{"featureType":"administrative.land_parcel","stylers":[{"visibility":"off"}]},{"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#bdbdbd"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#181818"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"poi.park","elementType":"labels.text.stroke","stylers":[{"color":"#1b1b1b"}]},{"featureType":"road","elementType":"geometry.fill","stylers":[{"color":"#2c2c2c"}]},{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#8a8a8a"}]},{"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#373737"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#3c3c3c"}]},{"featureType":"road.highway.controlled_access","elementType":"geometry","stylers":[{"color":"#4e4e4e"}]},{"featureType":"road.local","elementType":"labels.text.fill","stylers":[{"color":"#616161"}]},{"featureType":"transit","elementType":"labels.text.fill","stylers":[{"color":"#757575"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#000000"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#3d3d3d"}]}];
				var night =[{"elementType":"geometry","stylers":[{"color":"#242f3e"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#746855"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#242f3e"}]},{"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#263c3f"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#6b9a76"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#38414e"}]},{"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#212a37"}]},{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#9ca5b3"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#746855"}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#1f2835"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#f3d19c"}]},{"featureType":"transit","elementType":"geometry","stylers":[{"color":"#2f3948"}]},{"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#17263c"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#515c6d"}]},{"featureType":"water","elementType":"labels.text.stroke","stylers":[{"color":"#17263c"}]}];
				var aubergine =[{"elementType":"geometry","stylers":[{"color":"#1d2c4d"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#8ec3b9"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#1a3646"}]},{"featureType":"administrative.country","elementType":"geometry.stroke","stylers":[{"color":"#4b6878"}]},{"featureType":"administrative.land_parcel","elementType":"labels.text.fill","stylers":[{"color":"#64779e"}]},{"featureType":"administrative.province","elementType":"geometry.stroke","stylers":[{"color":"#4b6878"}]},{"featureType":"landscape.man_made","elementType":"geometry.stroke","stylers":[{"color":"#334e87"}]},{"featureType":"landscape.natural","elementType":"geometry","stylers":[{"color":"#023e58"}]},{"featureType":"poi","elementType":"geometry","stylers":[{"color":"#283d6a"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#6f9ba5"}]},{"featureType":"poi","elementType":"labels.text.stroke","stylers":[{"color":"#1d2c4d"}]},{"featureType":"poi.park","elementType":"geometry.fill","stylers":[{"color":"#023e58"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#3C7680"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#304a7d"}]},{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#98a5be"}]},{"featureType":"road","elementType":"labels.text.stroke","stylers":[{"color":"#1d2c4d"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#2c6675"}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#255763"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#b0d5ce"}]},{"featureType":"road.highway","elementType":"labels.text.stroke","stylers":[{"color":"#023e58"}]},{"featureType":"transit","elementType":"labels.text.fill","stylers":[{"color":"#98a5be"}]},{"featureType":"transit","elementType":"labels.text.stroke","stylers":[{"color":"#1d2c4d"}]},{"featureType":"transit.line","elementType":"geometry.fill","stylers":[{"color":"#283d6a"}]},{"featureType":"transit.station","elementType":"geometry","stylers":[{"color":"#3a4762"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#0e1626"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#4e6d70"}]}]; 

				var styles = '';
				if(style == 'standard'){
				  styles = standard;
				} else if (style == 'silver'){
				  styles = silver;
				} else if (style == 'retro'){
				  styles = retro;
				} else if (style == 'dark'){
				  styles = dark;
				} else if (style == 'night'){
				  styles = night;
				} else {
				  styles = aubergine;
				}

				map.addStyle({
					styledMapName:"Styled Map",
					styles: styles,
					mapTypeId: "map_style"  
				});
				
				map.setStyle("map_style");
			  GMaps.geocode({
				address: address,
				callback: function(results, status) {
				  if (status == 'OK') {
					var latlng = results[0].geometry.location;
					map.setCenter(latlng.lat(), latlng.lng());
					map.addMarker({
					  lat: latlng.lat(),
					  lng: latlng.lng()
					});
				  }
				}
			  });
			}

		});
	}
}

var ColorSwatches = {
	init: function(variant, selector) {
		var form = $( '#' + selector.domIdPrefix ).closest( 'form' );
		var enableColorSwatches = form.data( 'color_swatches' );

		if ( enableColorSwatches ) {
			if ( variant ) {
				for ( var i = 0, length = variant.options.length; i < length; i++ ) {
					var radioButton = form.find( '.swatch[data-option-index="' + i + '"] :radio[value="' + variant.options[i] +'"]' );
					if ( radioButton.length ) {
						radioButton.get(0).checked = true;
					}
				}
			}
		}
	},
	bind: function(container) {
		container.find( '.productForm' ).on( 'change', '.swatch :radio', function() {
			var colorTitle = $( this ).val();
			var optionIndex = $( this ).closest( '.swatch' ).attr( 'data-option-index' );
		  	var optionValue = $( this ).val();

		  	$( this )
				.closest( 'form' )
				.find( '.single-option-selector' )
				.eq( optionIndex )
				.val( optionValue )
				.trigger( 'change' );

			$( this ).closest( '.swatch' ).find( '.header__value' ).fadeIn( 300 ).text( colorTitle );

			// Change money format
			if ( typeof(Currency) != 'undefined' && Currency ){
			    Currency.convertAll(shopCurrency, $('[name=currencies]').val());
			    onCurrencySet();
			}
		});

		// Set color title on page load
		container.find( '.productForm .swatch :radio:checked' ).trigger( 'change' );
		container.find( '.productForm-block--swatches', container).removeClass( 'is-loading' );
	},
	unbind: function(container) {
		$( '.productForm', container ).off( 'change', '.swatch :radio' );
	}
}

var Popup = {
	init: function() {
		var self = this;
		var $popup = $('#popup');
		var popupEnabled = $popup.data('enabled');

		if (popupEnabled) {
			var testMode = $popup.data('testmode');
			var modalDelay = parseInt($popup.data('delay')) * 1000; // Convert from ms to seconds
			var reappearTime = parseInt($popup.data('reappear_time')) * 1000; // Convert from ms to seconds

			enquire.register("screen and (min-width:768px)", function() {
				Reqs.popup();
				Reqs.cookie();

				if (testMode) {
					self.show($popup, modalDelay, testMode);
				} else {
					//If cookie doesn't exist or it's expired
					if (Cookies.get('newsletter_delay') === undefined || reappearTime == 0){
						self.show($popup, modalDelay, testMode);
						self.createCookie(reappearTime);
					}
				}

				$.modal.defaults = {
					escapeClose: true,      // Allows the user to close the modal by pressing `ESC`
					clickClose: true,       // Allows the user to close the modal by clicking the overlay
					closeText: " ",     // Text content for the close <a> tag.
					closeClass: 'icon-close',         // Add additional class(es) to the close <a> tag.
					showClose: true,        // Shows a (X) icon/link in the top-right corner
					modalClass: "modal",    // CSS class added to the element being displayed in the modal.
					spinnerHtml: null,      // HTML appended to the default spinner during AJAX requests.
					showSpinner: true,      // Enable/disable the default spinner during AJAX requests.
					fadeDuration: 250,     // Number of milliseconds the fade transition takes (null means no transition)
					fadeDelay: .5          // Point during the overlay's fade-in that the modal begins to fade in (.5 = 50%, 1.5 = 150%, etc.)
				};
			});
		}
	},
	show: function($popup, modalDelay, testMode){
		var self = this;
		//Only show if it hasn't already been shown during that browser session
		if (sessionStorage.name != "shown" && $('html').hasClass('lt-ie9') == false){
			setTimeout(function() {
				$popup.modal();
				$popup.css('display','inline-block');
			}, modalDelay);

			// Safari Private Browsing Mode shiv
			if (typeof localStorage === 'object') {
				try {
					localStorage.setItem('localStorage', 1);
					localStorage.removeItem('localStorage');
					sessionStorage.name = "shown";
				} catch (e) {
					Storage.prototype._setItem = Storage.prototype.setItem;
					Storage.prototype.setItem = function() {};
				}
			}
		} else if (testMode) {
			setTimeout(function() {
				$popup.modal();
				$popup.css('display','inline-block');
			}, modalDelay);
		}
	},
	hide: function() {
		$('.jquery-modal').remove();
	},
	createCookie: function(reappearTime){
		if (reappearTime != 0){
			Cookies.set('newsletter_delay', 'value', { expires: reappearTime });
		} 
	}
}

var Search = {
	init: function() {
		var self = this;
		self.searchForm = $('.nav-standard .search-form');
		self.searchContainer = $('.nav-standard .nav-search-container');
		self.searchScroller = $('.nav-standard .nav-search-scroller');
		self.searchResultsContainer = $('#search-results');
		self.searchType = self.searchForm.find('input[name="type"]').val();
		self.searchRequest = null;
		self.searchForm.on('keyup', '.nav-search-input', function(e) {
			// Close if escape key pressed
			if (e.keyCode === 27) {
				self.close();
				Site.nav.search.close();
			}

			var query = $(this).val();
			if (query.length) {
				 query += '*';
				self.request(query);
			} else {
				self.close();
			}
		});

		self.searchContainer.on('click', '.js-loadMore', function(e) {
			e.preventDefault();
			var requestedURL = this.href;
			this.classList.add('loading');
			self.loadMore(requestedURL);
		});

		self.searchContainer.on('click', '.results__popular-links a', function(e) {
			e.preventDefault();
			var searchText = $(this).text();
			self.searchForm.find('.nav-search-input').val(searchText);
			self.request(searchText);
		});

		self.infiniteScroll();
	},
	close: function() {
		var self = this;
		self.searchResultsContainer.empty();
		self.searchContainer.removeClass('is-searching');
	},
	request: function(query) {
		var self = this;
		
		self.searchResultsContainer.empty();
		self.searchContainer.addClass('is-searching');

		// Kill previous ajax request
		if (self.searchRequest != null) {
		 	self.searchRequest.abort();
		}

		// Do a new ajax request
		self.searchRequest = $.ajax({
			method: 'GET',
			url: '/search?view=json',
			dataType: 'json',
			data: {
				q: query,
				type: self.searchType
			}
		}).done(function(data) {
			var searchResultsContent = '';
			var pagination = '';

			if (data.results_count) {
				var resultsText = data.results_count == 1 ? data.results_count + " result" : data.results_count + " results";
				var nextPage = data.next_page;

				searchResultsContent += '<div class="results__count">' + resultsText + '</div>\
										 <ul class="results__list">' + self.getResultsContent(data) + '</ul>';

				if (nextPage) {
					pagination = '<div class="pagination u-center"><a href="' + nextPage + '" class="js-loadMore loadMore loadMore--endlessScroll button">LOAD MORE</a><div class="load-more-icon"></div></div>';
				}

			} else {
				searchResultsContent = '<p class="no-results">No results found</p>';
			}

			self.searchResultsContainer.html(searchResultsContent);
			self.searchResultsContainer.append( pagination );
			self.searchContainer.removeClass('is-searching');
			Site.setBadgePosition();
			$(window).on('resize', Reqs.debounce(function() {
				Site.setBadgePosition();
			}, 250));
		});
	},
	infiniteScroll: function() {
		var self = this;
		self.searchScroller.on('scroll',function() {
			var scrolled = $(this).scrollTop();
			var scrollTriggerPoint = self.searchContainer.height() - self.searchScroller.height() * 2;
			var isSearching = self.searchContainer.hasClass('is-searching');

			if (scrolled >= scrollTriggerPoint && !isSearching) {
				self.searchContainer.find('.js-loadMore').trigger('click');	
				self.searchScroller.off('scroll');
			}
		});
	},
	loadMore: function(requestedURL) {
		var self = this;

		self.searchRequest = $.ajax({
			method: 'GET',
			url: requestedURL,
			dataType: 'json'
		}).done(function(data) {
			var pagination = '';
			var searchResultsContent = '';
			var nextPage = data.next_page;

			if (data.results_count) {
				searchResultsContent = self.getResultsContent(data);

				if (nextPage) {
					pagination += '<div class="pagination u-center"><a href="' + nextPage + '" class="js-loadMore loadMore loadMore--endlessScroll button">LOAD MORE</a><div class="load-more-icon"></div></div>';
				}
			}

			self.searchResultsContainer.find('.pagination').remove();
			self.searchResultsContainer.find('.results__list').append(searchResultsContent);
			self.searchResultsContainer.append( pagination );
			self.infiniteScroll();
			Site.setBadgePosition();
		});
	},
	getResultsContent: function(data) {
		var searchResultsContent = '';

		for ( var i = 0; i < data.results.length; i++ ) {
			var title = data.results[i].title;
			var url = data.results[i].url;
			var image = data.results[i].featured_image;
			var imageAspectRatio = data.results[i].image_aspectratio;
			var object_type = data.results[i].object_type;
			var sold_out = data.results[i].available ? false : true;
			var on_sale = data.results[i].on_sale;
			var flag = '';
			var flagClass = '';

			if (object_type == 'product')  {
				if (on_sale || sold_out) {
					flagClass += on_sale ? ' is-sale' : '';
					flagClass += sold_out ? ' is-sold-out' : '';

					flag = '<span class="product-status-flag' + flagClass + '">';
					if (sold_out) {
						flag += "SOLD OUT";
					} else if (on_sale) {
						flag += "SALE";
					} else if (on_sale && sold_out) {
						flag += "SOLD OUT";
					}

					flag += '</span>';
				}
			}

			searchResultsContent += '<li class="result">\
										<div class="result__image" data-aspectratio="' + imageAspectRatio + '"><a href="' + url + '" tabindex="3"><img src="' + image + ' alt="' + title + '" class="lazyload fade-in"/>' + flag + '</a></div>\
										<h3 class="result__title"><a href="' + url + '">' + title + '</a></h3>\
									</li>';
		}

		return searchResultsContent;
	},
	setBadgePosition: function() {
		var self = this;
		
		self.searchResultsContainer.find('.product-status-flag').each(function() {
			var badge = $(this);
			var imgContainer = badge.closest('.result__image');
			var imgContainerWidth = imgContainer.outerWidth();
			var imgContainerHeight = imgContainer.outerHeight();
			var imgContainerRatio = imgContainerWidth / imgContainerHeight;
			var imageAspectRatio = imgContainer.data('aspectratio');
			var diffRatio = imageAspectRatio / imgContainerRatio;
			var posLeft = 0;
			var posTop = 0;

			if ( imageAspectRatio > imgContainerRatio ) {
				posLeft = 0;
				posTop = parseInt( ( imgContainerHeight - imgContainerHeight / imgContainerRatio ) / 2 );
			} else {
				posTop = 0;
				posLeft = parseInt( ( imgContainerWidth - imgContainerWidth * diffRatio)  / 2 );
			}

			badge.css({
				top: posTop,
				left: posLeft,
				opacity: 1
			});
		});
	}
}

var Password = {
	init: function() {
		var $targets = $('.password-signup, .password-login');

		$targets.each( function(){
			var $el = $(this);
			if ( $el.find('div.errors').length ) {
				$el.find('input.password, input.email').select();
			}
		});
	}
}