/*jshint laxbreak:true, browser:true, boss:true, forin:false*/
window.maquerau || (function(document,Undef){
"use strict";

	// monkey patching XHR.open to track pending requests
	var oldOpen = XMLHttpRequest.prototype.open
		, trackerListeners={opened:[], complete:[], ready:[]}
	;

	function triggerTrackingEvent(type,xhr){
		if(! trackerListeners[type] ){
			return;
		}
		var i=0, cbs=trackerListeners[type], l=cbs.length, cb;
		cbs.reverse();
		for(; i<l; i++){
			cb = cbs.pop();
			if( false === cb.call(xhr,xhr)){
				break;
			}
		}
		trackerListeners[type]=[];
	}

	XMLHttpRequest.tracker = {
		pendings: 0
		, start: function(xhr){
			xhr.addEventListener('readystatechange',XMLHttpRequest.tracker.readystatechange);
			XMLHttpRequest.tracker.pendings++;
			triggerTrackingEvent('opened',xhr);
		}
		, readystatechange: function(forced){
			if( 4 !== this.readyState && true !== forced){
				return;
			}
			XMLHttpRequest.tracker.pendings--;
			triggerTrackingEvent('complete',this);
			if( XMLHttpRequest.tracker.pendings === 0 ){
				triggerTrackingEvent('ready');
			}
		}
		, addEventListener: function(type,cb){
			trackerListeners[type] && trackerListeners[type].push(cb);
		}
	};

	XMLHttpRequest.prototype.open = function(){
		XMLHttpRequest.tracker.start(this);
		oldOpen.apply(this, arguments);
	};

	//monkey patching document.createElement
	var oldCE = document.createElement;
	document.createElement = function(){
		var e = oldCE.apply(this, arguments), resolved=false;
		if( e.tagName === 'SCRIPT' ){
			if( 'readyState' in e ){
				XMLHttpRequest.tracker.start(e);
			} else {
				XMLHttpRequest.tracker.pendings++;
				triggerTrackingEvent('opened',e);
				var resolveCB = function(){
					if( resolved ){
						return;
					}
					resolved = true;
					XMLHttpRequest.tracker.readystatechange.call(e,true);
				};
				if( e.onloadend ){
					e.onloadend = resolveCB;
				} else {
					e.onload = resolveCB;
					e.onerror = resolveCB;
					e.ontimeout = resolveCB;
					e.onabort = resolveCB;
				}
				setTimeout(resolveCB,1000);
			}
		}
		return e;
	};

	/**
	 * return a selector to use with document.querySelector to retrieve given node
	 * @param {DOMElement} node
	 * @returns {string}
	 */
	function getSelector(node){
		// check for node.id avoiding autogenerated ids by ignoring any ids containing numeric values
		// and checking that the id is unique in the document.
		if (node.id && node.id.match(/^\D+$/) && document.querySelectorAll('#' + node.id).length === 1) {
			return '#' + node.id;
		}

		/*if (node.getAttribute('class')) {
			var classNames = node.getAttribute('class').split(/\s+/)
				, i = 0
				, l = classNames.length
			;
			for(; i<l; i++){
				if (classNames[i] === ''){
					continue;
				}
				try{
				if (document.querySelectorAll('.' + classNames[i]).length === 1) {
					return '.' + classNames[i];
				}
				}catch(e){
					console.log(e, '.' + classNames[i]);
					throw e;
				}
			}
		}*/

		// if node is body don't make any other lookup
		if (node === document.body) {
			return 'body';
		}

		// making a "more complex" node selector
		var parent = node.parentNode, tagName = node.tagName;

		// if only one child of type inside the parent made a simple tag selector
		if (parent.querySelector(tagName).length === 1) {
			return getSelector(parent) + '>' + tagName;
		}

		var prevSibling = node, nthOfType = 1;
		// finally end up selecting the node by its nthOfType
		while(prevSibling = prevSibling.previousElementSibling) {
			prevSibling.tagName === tagName && ++nthOfType;
		}
		return getSelector(parent) + '>' + tagName + ':nth-of-type(' + nthOfType + ')';
	}

	var timeRef = 0;
	function getStepDelay(init){
		if( init ){
			timeRef = new Date();
			return 0;
		}
		var ref = timeRef.getTime();
		timeRef = new Date();
		return timeRef.getTime() - ref;
	}

	function stepItem(selector, delay, type, props){
		var item = {
			type:type
			, $:selector
			, delay:delay
			, opts:{}
		};
		if( props ){
			for( var i in props ){
				item.opts[i] = props[i];
			}
		}
		return item;
	}

	function fireEvent(elmt, type, opts){
		if(! elmt){
			return false;
		}
		/*if( type.match(/^(click|mouse(down|up))$/) ){
			try{ // proper modern method
				var eprops = {
						view:window,
						bubbles:true,
						cancelable:true,
						target:elmt,
						button:0//,
						//detail:1
					}
					,evt = new MouseEvent('mousedown',eprops)
				;
				console.log(evt,elmt);
				elmt.dispatchEvent(evt);
			}catch(exception){
			//}
			*/
			var evt = document.createEvent('MouseEvent');
			opts || ( opts = {} );
			evt.initMouseEvent(
				type
				, true
				, true
				, window
				, 1
				, opts.screenX || 0
				, opts.screenY || 0
				, opts.clientX || 0
				, opts.clientY || 0
				, opts.ctrlKey || false
				, opts.altKey || false
				, opts.shiftKey || false
				, opts.metaKey || false
				, opts.button || 0
				, elmt
			);
			//evt.target = elmt;
			elmt.dispatchEvent(evt);
		//}}
	}
/*global localStorage, alert, JSON */
	var macros = JSON.parse(localStorage.getItem('_macros_')) || {}
		, macroStepTime = localStorage.getItem('_macros_steptime_') || 350 //@todo make a prompt to let user set this value
		, macroMaxRetry = 5
		, stepEventsExp = /^(dblclick|click)$/
		, mouseEvents = [/*'mouseenter','mouseover',*/ 'mousedown', 'mouseup', 'click' /*, 'mouseout', 'mouseleave'*/]
		, mouseEventProps = ['clientX', 'clientY', 'screenX', 'screenY', 'ctrlKey', 'altKey', 'shiftKey', 'metaKey', 'button']
		, listeners = {
			get: function(eType){
				if( eType in listeners ){
					return listeners[eType];
				}
				listeners[eType] = function(e){
					var props;
					if (e instanceof MouseEvent) {
						props = {};
						for(var i=0, l=mouseEventProps.length; i<l; i++){
							props[mouseEventProps[i]] = e[mouseEventProps[i]];
						}
					}
					recordingMacro && e.target && recordingMacro.push( stepItem(getSelector(e.target), getStepDelay(), eType, props));
				};
				return listeners[eType];
			}
		}
		, triggers = {
			get: function(eType){
				if( eType in triggers ){
					return triggers[eType];
				}
				triggers[eType] =  function(elmt, opts){
					fireEvent(elmt, eType, opts);
				};
				return triggers[eType];
			}
		}
		, macroStep=function(macro,index,stepTime, retry){
			retry || (retry = 0);
			var stepItem = macro[index]
				, elmt = stepItem.$ && document.querySelector(stepItem.$)
				, trigger = triggers.get(stepItem.type)
			;
			if(! elmt && retry < macroMaxRetry ){
				// retry after macroStepTime to eventually wait for element to be rendered
				console.log('retry', retry,  stepItem);
				setTimeout( function(){ macroStep(macro, index, stepTime, retry);}, ++retry * 2 * macroStepTime);
				return;
			}
			if(! (elmt && stepItem.type && trigger) ){
				console.log('maquereau replay aborted on step', macro.length - index, 'of', macro.length);
				return;
			}
			trigger(elmt, stepItem.opts);
			if(! index){
				return;
			}

			var readyCB = function(){
				// add a minimal delay to let do eventual ui computation after some events
				setTimeout(function(){macroStep(macro,index-1,stepTime);}, stepItem.type.match(stepEventsExp) ? macroStepTime : 0);
				//macroStep(macro,index-1,stepTime);
			};

			if( XMLHttpRequest.tracker.pendings > 0 ){
				XMLHttpRequest.tracker.addEventListener('ready', readyCB);
			} else {
				readyCB();
			}
		}
		, recordingMacro
	;

	window.maquereau = {
		start: function(){
			recordingMacro=[];
			getStepDelay(true);
			for( var i=0, l=mouseEvents.length; i<l; i++){
				document.addEventListener(mouseEvents[i], listeners.get(mouseEvents[i]), true);
			}
		}
		,stop: function(){
			if(! (recordingMacro && recordingMacro.length) ){
				recordingMacro = Undef;
				return;
			}
			for( var i=0, l=mouseEvents.length; i<l; i++){
				document.removeEventListener(mouseEvents[i], listeners.get(mouseEvents[i]));
			}

			var macroName = window.prompt("Enter macro name");
			if(! macroName){
				return;
			}
			macros[macroName] = recordingMacro.reverse();
			localStorage.setItem('_macros_',JSON.stringify(macros));
			localStorage.setItem('_macros.last_',macroName);
			recordingMacro = Undef;
		}
		,replay: function(macroName,stepTime){
			if(! macros[macroName]){
				//noinspection JSHint
				alert('macros does not exists');
			} else {
				macroStep(macros[macroName],macros[macroName].length -1, stepTime || macroStepTime);
				localStorage.setItem('_macros.last_',macroName);
			}
		}
		,replayLast: function(stepTime){
			var macroName = localStorage.getItem('_macros.last_');
			if (! macroName) {
				return;
			}
			if (stepTime) {
				macroStepTime = parseInt(stepTime, 10) || macroStepTime;
			//	macroStep(macros[macroName],macros[macroName].length -1, stepTime );
			}
			return this.replay(macroName, macroStepTime);
		}
		,remove:function(macroName /*, refreshDisplay*/){
			delete macros[macroName];
			localStorage.setItem('_macros_',JSON.stringify(macros));
			this.removeDisplay();
			this.displayList();
			return false;
		}
		,list: function(){
			return Object.keys(macros);
		}
		,removeDisplay:function(){
			var list = document.getElementById('maquereauList');
			list.parentNode.removeChild(list);
		}
		,displayList:function(){
			var keys = this.list(), i, l, res=[];
			for(i=0, l=keys.length;i<l;i++){
				res.push('<li tabindex="0" onclick="maquereau.removeDisplay(); maquereau.replay(\''+keys[i]+'\',800);" style="display:block;background:#eee;cursor:pointer;color:#333;padding:.4em;">'+keys[i]+'<span style="float:right;padding:.1em;display:inline-block;background:red;" onclick="maquereau.remove(\''+keys[i]+'\'); event.stopImmediatePropagation(); event.preventDefault(); return false;" >delete</span></li>');
			}
			var f = document.createDocumentFragment().appendChild(document.createElement('div'));
			f.id='maquereauList';
			f.innerHTML += '<div style="z-index:9999999;position:fixed;top:0;right:0;background:#fff;padding:1em;border:solid silver 1px;color:#333;font-size:12px;">'
				+ '<style>#maquereauList li:focus{ outline: dashed orange 1px !important;}</style>'
				+ '<h4>Maquereau list of registered macros</h4><small>click a macro to replay</small>'
				+ '<ul style="margin:.4em; padding:0;min-width:250px;">'+res.join('')+'</ul>'
				+ '<div onclick="maquereau.removeDisplay();" style="text-align:center;cursor:pointer;">close</div></div>';
			document.body.appendChild(f);
			document.querySelector('#maquereauList li').focus();
		}
		,setStepTime:function(){
			var stepTime = parseInt(window.prompt('enter a time in ms to wait between steps'),10);
			stepTime && localStorage.setItem('_macros_steptime_', macroStepTime = stepTime);
		}
	};
})(window.document);
