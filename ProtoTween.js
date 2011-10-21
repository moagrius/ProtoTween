(function(){
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Locals //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	
	var time = function(){
		return +(new Date());
	};
	
	var timestamp;
	var timer;
	var uuid = 0;
	var list = {};
	
	var exec = function(){  // engine that fires during each interval
		timestamp = time();  // get the timestamp once, and pass it to all tween
		for(var tween in list){  // run each tween
			list[tween]._run(timestamp);
		};
		if(!hasTweens()){  // if there aren't any registered tweens, kill the timer
			window.clearInterval(timer);
			timer = null;
		};
	};
	
	var hasTweens = function(){  // returns true if any tweens are registered, false if not
		for(var tween in list){
			return true;
		};
		return false;
	};	
	
	var constrain = function(n){  // force percentage to 0 and 1 - the actual ease can exceed (bounce, elastic), but percent will always be between 0 and 1 inclusive
		return Math.max(0, Math.min(1, n));
	};
	
	var linear = function(a, b, c, d){  // default ease is linear - just returns the straight percent
		return a;
	};
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Event Class /////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	var TweenEvent = function(type){
		this.type = type;
	};
	
	// event instance members
	TweenEvent.prototype.type = null;
	TweenEvent.prototype.target = null;
	TweenEvent.prototype.progress = 0;
	TweenEvent.prototype.percent = 0;
	
	// tween instance event constants
	TweenEvent.UPDATE = 'update';
	TweenEvent.BEFORE_UPDATE = 'beforeUpdate';
	TweenEvent.AFTER_UPDATE = 'afterUpdate';
	TweenEvent.COMPLETE = 'complete';
	TweenEvent.FIRST_FRAME = 'firstFrame';
	TweenEvent.LAST_FRAME = 'lastFrame';
	TweenEvent.YOYO = 'yoyo';
	
	// cache a single event - run everything off this one instance
	var e = new TweenEvent();
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Tween Class /////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	var ProtoTween = function(duration, easing){
	
		this._easing = (typeof easing == 'function' && isFinite(easing(1, 0, 1, 1))) 
			? easing 
			: linear;
			
		this._duration = duration;
		this._listeners = {};
		this._id = uuid++;
		
		this._initialized = time();
		
		this.addEventListener(TweenEvent.COMPLETE, this._completeHandler);
		
	};
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Instance Variables (All Private) ////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	ProtoTween.prototype._id = null;
	ProtoTween.prototype._listeners = null;
	ProtoTween.prototype._reversed = false;
	ProtoTween.prototype._yoyo = false;
	ProtoTween.prototype._loops = false;
	ProtoTween.prototype._easing = null;
	ProtoTween.prototype._duration = 0;
	
	// timestamps
	ProtoTween.prototype._initialized = 0;  // timestamp when tween was instantiated
	ProtoTween.prototype._started = 0;  //  an offset of time spent paused, reversed, etc
	ProtoTween.prototype._stopped = 0;  // time relative to initialization that tween was stopped, resets each stop
	
	// factors
	ProtoTween.prototype._progress = 0;  // factor (0 - 1), weighed by the easing method
	ProtoTween.prototype._percent = 0;  // factor (0 - 1), not affected by easing - 0.5 means 50% of the way through
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Event Management ////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	ProtoTween.prototype._detectListeners = function(type){
		return this._listeners[type] != null;
	};
	ProtoTween.prototype.addEventListener = function(type, callback){
		if(!this._detectListeners(type)) {
			this._listeners[type] = [];
		};
		this._listeners[type].push(callback);
	};
	ProtoTween.prototype.removeEventListener = function(type, callback){
		if(!this._detectListeners(type)) {
			return;
		};
		var stack = this._listeners[type];
		for(var i = 0, l = stack.length; i < l; i++){
			if(stack[i] === callback){
				stack.splice(i, 1);
				return this.removeEventListener(type, callback);
			};
		};
	};
	ProtoTween.prototype.removeEventListeners = function(type){
		if(!this._detectListeners(type)) {
			return;
		};
		delete this._listeners[type];
	};
	ProtoTween.prototype.removeAllEventListeners = function(){
		this._listeners = {};
	};
	ProtoTween.prototype.dispatchEvent = function(event){
		var type = event.type;
		if(!this._detectListeners(type)) {
			return;
		}
		event.target = this;
		var stack = this._listeners[type];
		for(var i = 0, l = stack.length; i < l; i++) {
			stack[i](event);
		};
	};
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Private Methods /////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	ProtoTween.prototype._completeHandler = function(e){
		e.target.stop();	
	};
	ProtoTween.prototype._register = function(){
		list[this._id] = this;
		this._startTimer();
	};
	ProtoTween.prototype._startTimer = function(){
		if(!timer){
			timer = window.setInterval(exec, ProtoTween.interval);
			timestamp = time();
		};
	};
	ProtoTween.prototype._broadcast = function(type){
		e.type = type;
		e.progress = this._progress;
		e.percent = this._percent;
		this.dispatchEvent(e);
	};
	ProtoTween.prototype._beforeUpdate = function(){
		if(this._percent === 0){
			this._broadcast(TweenEvent.FIRST_FRAME);
		};
		this._broadcast(TweenEvent.BEFORE_UPDATE);
	};
	ProtoTween.prototype._afterUpdate = function(){
		this._broadcast(TweenEvent.UPDATE);
		this._broadcast(TweenEvent.AFTER_UPDATE);
		if(this._percent === 1){  // using strict to ensure true doesn't eval, but not sure that'll ever happen
			this._broadcast(TweenEvent.LAST_FRAME);
			if(this._yoyo){
				this._broadcast(TweenEvent.YOYO);
				this.rewind();
				if(!this._loops){
					this._yoyo = false;
				};
			} else {
				if(this._loops){
					this.restart();
				} else {
					if(!this._reversed){
						this._broadcast(TweenEvent.COMPLETE);
					};
				};		
			};
		};
		if(this._percent === 0){				
			if(this._yoyo){
				this._broadcast(TweenEvent.YOYO);
				this.restart();
				if(!this._loops){
					this._yoyo = false;
				};
			} else {
				if(this._reversed){
					if(this._loops){
						this.rewind();
					} else {
						this._broadcast(TweenEvent.COMPLETE);
					};
				};
			};	
		};
	};
	ProtoTween.prototype._update = function(timestamp){
		var time = timestamp - this._initialized;  // don't call _ellapsed here because the one Date call (timestamp) is passed to all tweens
		time = this._reversed
			? this._duration - (time - this._started)
			: time - this._started;
		this._playhead = time;
		this._percent = constrain(this._playhead / this._duration);
		this._progress = this._easing(this._percent, 0, 1, 1);
	};
	ProtoTween.prototype._run = function(timestamp){
		this._beforeUpdate();
		this._update(timestamp);
		this._afterUpdate();
	};
	ProtoTween.prototype._offset = function(time){
		var tt = isNaN(this._stopped) ? this._ellapsed() : this._stopped;
		this._started = tt - ((this._reversed) ? (this._duration - time) : time);
	};
	ProtoTween.prototype._ellapsed = function(){
		return time() - this._initialized;
	};
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Public Methods /////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

	ProtoTween.prototype.isPlaying = function(){
		return (this._id in list);
	};
	ProtoTween.prototype.stop = function(){
		if(this.isPlaying()){
			this._stopped = this._ellapsed();
			delete list[this._id];
		};
	};
	ProtoTween.prototype.play = function(){
		if(!this.isPlaying()){
			this._started += this._ellapsed() - this._stopped;
			this._stopped = NaN;
			this._register();
		};		
	};
	ProtoTween.prototype.toggle = function(){
		this.isPlaying() 
			? this.stop()
			: this.play();
	};
	ProtoTween.prototype.reverse = function(value){
		if(typeof value == 'undefined'){
			value = !this._reversed;
		};
		if (value != this._reversed) {
			this._reversed = value;
			this._offset(this._playhead);
		};
	};
	ProtoTween.prototype.yoyo = function(value){
		if(typeof value == 'undefined'){
			value = !this._yoyo;
		};
		this._yoyo = value;
	};
	ProtoTween.prototype.loops = function(value){
		if(typeof value == 'undefined'){
			value = !this._loops;
		};
		this._loops = value;
	};
	ProtoTween.prototype.restart = function(){
		this.reverse(false);
		this._offset(0);
	};
	ProtoTween.prototype.rewind = function(){
		this.reverse(true);
		this._offset(this._duration);
	};
	ProtoTween.prototype.updateDuration = function(duration){
		if(isFinite(duration)){
			var progress = this._playhead / this._duration;
			this._duration = duration;
			if (this.isPlaying()) {
				this._offset(duration * progress);
			};
		};
	};
	ProtoTween.prototype.updateEasing = function(easing){
		if(typeof easing == 'function' && isFinite(easing(1, 0, 1, 1))){
			this._ease = easing;
		};
	};
	ProtoTween.prototype.wait = function(duration){
		this.stop();
		var ref = this;
		window.setTimeout(function(){
			ref.play();
		}, duration);
	};
	
	// catch variance in syntax
	ProtoTween.prototype.start = ProtoTween.prototype.resume = ProtoTween.prototype.play;
	ProtoTween.prototype.pause = ProtoTween.prototype.stop;

	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Static Members //////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	ProtoTween.interval = 25;
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Easing //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	var Easing = {
	
		Linear : {
			easeNone : function (t, b, c, d) {
				return c * t / d + b;
			}
		},
		
		
		Quad : {
			easeIn : function (t, b, c, d) {
				return c * (t /= d) * t + b;
			},
			easeOut : function (t, b, c, d) {
				return -c * (t /= d) * (t - 2) + b;
			},
			easeInOut : function (t, b, c, d) {
				if ((t /= d / 2) < 1) return c / 2 * t * t + b;
				return -c / 2 * ((--t) * (t - 2) - 1) + b;
			}
		},
		
		Cubic : {
			easeIn :  function (t, b, c, d) {
				return c * (t /= d) * t * t + b;
			},
			easeOut :  function (t, b, c, d) {
				return c * ((t = t / d - 1) * t * t + 1) + b;
			},
			easeInOut :  function (t, b, c, d) {
				if ((t /= d / 2) < 1) return c / 2 * t * t * t + b;
				return c / 2 * ((t -= 2) * t * t + 2) + b;
			}
		},
		
		Quart : {
			easeIn :  function (t, b, c, d) {
				return c * (t /= d) * t * t * t + b;
			},
			easeOut :  function (t, b, c, d) {
				return -c * ((t = t / d - 1) * t * t * t - 1) + b;
			},
			easeInOut :  function (t, b, c, d) {
				if ((t /= d / 2) < 1) return c / 2 * t * t * t * t + b;
				return -c / 2 * ((t -= 2) * t * t * t - 2) + b;
			}
		},
		
		Quint : {			
			easeIn :  function (t, b, c, d) {
				return c * (t /= d) * t * t * t * t + b;
			},
			easeOut :  function (t, b, c, d) {
				return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
			},
			easeInOut :  function (t, b, c, d) {
				if ((t /= d / 2) < 1) return c / 2 * t * t * t * t * t + b;
				return c / 2 * ((t -= 2) * t * t * t * t + 2) + b;
			}
		},
		
		Circ : {
			easeIn :  function (t, b, c, d) {
				return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
			},
			easeOut :  function (t, b, c, d) {
				return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
			},
			easeInOut :  function (t, b, c, d) {
				if ((t /= d / 2) < 1) return -c / 2 * (Math.sqrt(1 - t * t) - 1) + b;
				return c / 2 * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
			}
		},
		
		Sine : {
			easeIn :  function (t, b, c, d) {
				return -c * Math.cos(t / d * (Math.PI / 2)) + c + b;
			},
			easeOut :  function (t, b, c, d) {
				return c * Math.sin(t / d * (Math.PI / 2)) + b;
			},
			easeInOut :  function (t, b, c, d) {
				return -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
			}
		},
		
		Expo : {
			easeIn :  function (t, b, c, d) {
				return (t == 0) ? b : c * Math.pow(2, 10 * (t / d - 1)) + b;
			},
			easeOut :  function (t, b, c, d) {
				return (t == d) ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
			},
			easeInOut :  function (t, b, c, d) {
				if (t == 0) return b;
				if (t == d) return b + c;
				if ((t /= d / 2) < 1) return c / 2 * Math.pow(2, 10 * (t - 1)) + b;
				return c / 2 * (-Math.pow(2, -10 * --t) + 2) + b;
			}
		},
		
		Back: {
			easeIn :  function (t, b, c, d, s) {
				if(isNaN(s)) s = 1.70158;
				return c * (t /= d) * t * ((s + 1) * t - s) + b;
			},
			easeOut :  function (t, b, c, d, s) {
				if(isNaN(s)) s = 1.70158;
				return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
			},
			easeInOut :  function (t, b, c, d, s) {
				if(isNaN(s)) s = 1.70158;
				if ((t /= d / 2) < 1) return c / 2 * (t * t * (((s *= (1.525)) + 1) * t - s)) + b;
				return c / 2 * ((t -= 2) * t * (((s *= (1.525)) + 1) * t + s) + 2) + b;
			}
		},
		
		Bounce : {
			easeIn :  function (t, b, c, d) {
				return c - Easing.Bounce.easeOut(d - t, 0, c, d) + b;
			},
			easeOut :  function (t, b, c, d) {
				if ((t /= d) < (1 / 2.75)) return c * (7.5625 * t * t) + b;
				if (t < (2 / 2.75)) return c * (7.5625 * (t -= (1.5 / 2.75)) * t + .75) + b;
				if (t < (2.5 / 2.75)) return c * (7.5625 * (t -= (2.25 / 2.75)) * t + .9375) + b;
				return c * (7.5625 * (t -= (2.625 / 2.75)) * t + .984375) + b;
			},
			easeInOut :  function (t, b, c, d) {
				if (t < d / 2) return Easing.Bounce.easeIn(t * 2, 0, c, d) * .5 + b;
				return Easing.Bounce.easeOut(t * 2 - d, 0, c, d) * .5 + c * .5 + b;
			}
		},
		
		Elastic : {
			easeIn :  function (t, b, c, d, a, p) {
				if(isNaN(a)) a = 0;
				if(isNaN(p)) p = 0;
				var s;
				if (t == 0) return b;
				if ((t /= d) == 1) return b + c;
				if (!p) p = d * .3;
				if (!a || a < Math.abs(c)) {
					a = c;
					s = p / 4;
				} else s = p / (Math.PI * 2) * Math.asin(c / a);
				return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (Math.PI * 2) / p)) + b;
			},
			easeOut :  function (t, b, c, d, a, p) {
				if(isNaN(a)) a = 0;
				if(isNaN(p)) p = 0;
				var s;
				if (t == 0) return b;
				if ((t /= d) == 1) return b + c;
				if (!p) p = d * .3;
				if (!a || a < Math.abs(c)) {
					a = c;
					s = p / 4;
				} else s = p / (Math.PI * 2) * Math.asin(c / a);
				return (a * Math.pow(2, -10 * t) * Math.sin((t * d - s) * (Math.PI * 2) / p) + c + b);
			},
			easeInOut :  function (t, b, c, d, a, p) {
				if(isNaN(a)) a = 0;
				if(isNaN(p)) p = 0;
				var s;
				if (t == 0) return b;
				if ((t /= d / 2) == 2) return b + c;
				if (!p) p = d * (.3 * 1.5);
				if (!a || a < Math.abs(c)) {
					a = c;
					s = p / 4;
				} else s = p / (Math.PI * 2) * Math.asin(c / a);
				if (t < 1) return -.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * (Math.PI * 2) / p)) + b;
				return a * Math.pow(2, -10 * (t -= 1)) * Math.sin((t * d - s) * (Math.PI * 2) / p) * .5 + c + b;
			}
		}
		
	};
	
	// catch variance in syntax
	Easing.Quintic = Easing.Strong = Easing.Quint;
	Easing.Quartic = Easing.Quart;
	
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Expose //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	ProtoTween.TweenEvent = TweenEvent;
	ProtoTween.Easing = Easing;
	return this.ProtoTween = window.ProtoTween = ProtoTween;
	
})();
