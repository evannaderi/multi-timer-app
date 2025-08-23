class Timer {
    constructor(config = {}) {
        this.id = config.id || Date.now().toString();
        this.name = config.name || 'Timer';
        this.intervals = config.intervals || [
            { duration: 25 * 60, type: 'work', label: 'Work' },
            { duration: 5 * 60, type: 'break', label: 'Break' }
        ];
        this.currentIntervalIndex = 0;
        this.currentCycle = 1;
        this.totalCycles = config.totalCycles || -1; // -1 means infinite
        this.infiniteRepeat = config.infiniteRepeat !== undefined ? config.infiniteRepeat : true;
        this.workNotificationText = config.workNotificationText || '';
        this.breakNotificationText = config.breakNotificationText || '';
        this.remainingTime = this.intervals[0].duration;
        this.isRunning = false;
        this.isPaused = false;
        this.intervalId = null;
        this.onUpdate = config.onUpdate || (() => {});
        this.onComplete = config.onComplete || (() => {});
        this.onIntervalComplete = config.onIntervalComplete || (() => {});
    }

    start() {
        if (this.isRunning && !this.isPaused) return;
        
        this.isRunning = true;
        this.isPaused = false;
        
        this.intervalId = setInterval(() => {
            this.tick();
        }, 1000);
    }

    pause() {
        if (!this.isRunning || this.isPaused) return;
        
        this.isPaused = true;
        clearInterval(this.intervalId);
        this.intervalId = null;
    }

    stop() {
        this.isRunning = false;
        this.isPaused = false;
        this.currentIntervalIndex = 0;
        this.currentCycle = 1;
        this.remainingTime = this.intervals[0].duration;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.onUpdate();
    }

    tick() {
        this.remainingTime--;
        
        if (this.remainingTime <= 0) {
            this.handleIntervalComplete();
        }
        
        this.onUpdate();
    }

    handleIntervalComplete() {
        this.onIntervalComplete(this.getCurrentInterval());
        
        this.currentIntervalIndex++;
        
        if (this.currentIntervalIndex >= this.intervals.length) {
            this.currentIntervalIndex = 0;
            this.currentCycle++;
            
            if (!this.infiniteRepeat && this.currentCycle > this.totalCycles) {
                this.complete();
                return;
            }
        }
        
        this.remainingTime = this.intervals[this.currentIntervalIndex].duration;
    }

    complete() {
        this.stop();
        this.onComplete();
    }

    getCurrentInterval() {
        return this.intervals[this.currentIntervalIndex];
    }

    getProgress() {
        const currentInterval = this.getCurrentInterval();
        const elapsed = currentInterval.duration - this.remainingTime;
        return (elapsed / currentInterval.duration) * 100;
    }

    getFormattedTime() {
        const minutes = Math.floor(this.remainingTime / 60);
        const seconds = this.remainingTime % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    getStatus() {
        if (!this.isRunning) return 'stopped';
        if (this.isPaused) return 'paused';
        return 'running';
    }

    updateIntervals(intervals) {
        this.intervals = intervals;
        if (!this.isRunning) {
            this.remainingTime = this.intervals[0].duration;
        }
    }

    updateCycles(cycles) {
        this.totalCycles = cycles;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            intervals: this.intervals,
            totalCycles: this.totalCycles,
            infiniteRepeat: this.infiniteRepeat,
            workNotificationText: this.workNotificationText,
            breakNotificationText: this.breakNotificationText,
            currentIntervalIndex: this.currentIntervalIndex,
            currentCycle: this.currentCycle,
            remainingTime: this.remainingTime,
            isRunning: this.isRunning,
            isPaused: this.isPaused
        };
    }

    static fromJSON(data, callbacks = {}) {
        const timer = new Timer({
            id: data.id,
            name: data.name,
            intervals: data.intervals,
            totalCycles: data.totalCycles,
            infiniteRepeat: data.infiniteRepeat !== undefined ? data.infiniteRepeat : true,
            workNotificationText: data.workNotificationText || '',
            breakNotificationText: data.breakNotificationText || '',
            ...callbacks
        });
        
        timer.currentIntervalIndex = data.currentIntervalIndex || 0;
        timer.currentCycle = data.currentCycle || 1;
        timer.remainingTime = data.remainingTime || timer.intervals[0].duration;
        
        if (data.isRunning && !data.isPaused) {
            timer.start();
        }
        
        return timer;
    }
}