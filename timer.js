// Initialize shared Web Worker for all timers
let sharedWorker = null;
const workerCallbacks = new Map();

function getOrCreateWorker() {
    if (!sharedWorker) {
        sharedWorker = new Worker('timer-worker.js');
        sharedWorker.addEventListener('message', (e) => {
            const { type, id, remainingTime, timestamp } = e.data;
            
            if (type === 'tick' && workerCallbacks.has(id)) {
                const callbacks = workerCallbacks.get(id);
                if (callbacks.onTick) {
                    callbacks.onTick(remainingTime, timestamp);
                }
            } else if (type === 'intervalComplete' && workerCallbacks.has(id)) {
                const callbacks = workerCallbacks.get(id);
                if (callbacks.onIntervalComplete) {
                    callbacks.onIntervalComplete();
                }
            }
        });
    }
    return sharedWorker;
}

class Timer {
    constructor(config = {}) {
        this.id = config.id || Date.now().toString();
        this.name = config.name || 'Timer';
        this.project = config.project || '';
        this.projectColor = config.projectColor || '#4f46e5';
        this.intervals = config.intervals || [
            { duration: 25 * 60, type: 'work', label: 'Work' },
            { duration: 5 * 60, type: 'break', label: 'Break' }
        ];
        this.currentIntervalIndex = 0;
        this.currentCycle = 1;
        this.totalCycles = config.totalCycles || -1; // -1 means infinite
        this.infiniteRepeat = config.infiniteRepeat !== undefined ? config.infiniteRepeat : true;
        this.autoStart = config.autoStart !== undefined ? config.autoStart : true; // Auto-start next interval by default
        this.workNotificationText = config.workNotificationText || '';
        this.breakNotificationText = config.breakNotificationText || '';
        this.remainingTime = this.intervals[0].duration;
        this.isRunning = false;
        this.isPaused = false;
        this.intervalId = null;
        this.sessionStartTime = null;
        this.totalTimeSpent = 0;
        this.lastTickTime = null;
        this.expectedTime = null;
        this.onUpdate = config.onUpdate || (() => {});
        this.onComplete = config.onComplete || (() => {});
        this.onIntervalComplete = config.onIntervalComplete || (() => {});
        
        // Initialize Web Worker for this timer
        this.worker = getOrCreateWorker();
        this.useWorker = true;
        this.setupWorkerCallbacks();
        
        // Fallback timer for when worker fails
        this.fallbackIntervalId = null;
        
        // Wake Lock API to prevent device sleep
        this.wakeLock = null;
    }

    setupWorkerCallbacks() {
        workerCallbacks.set(this.id, {
            onTick: (remainingTime, timestamp) => {
                this.remainingTime = remainingTime;
                this.lastTickTime = timestamp;
                
                if (remainingTime === 0) {
                    this.handleIntervalComplete();
                }
                
                this.onUpdate();
            },
            onIntervalComplete: () => {
                // Already handled in onTick when remainingTime === 0
            }
        });
    }
    
    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock acquired');
                
                this.wakeLock.addEventListener('release', () => {
                    console.log('Wake Lock released');
                });
            } catch (err) {
                console.log('Wake Lock failed:', err);
            }
        }
    }
    
    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
    }
    
    start() {
        if (this.isRunning && !this.isPaused) return;
        
        this.isRunning = true;
        this.isPaused = false;
        
        if (!this.sessionStartTime) {
            this.sessionStartTime = Date.now();
        }
        
        // Always reset lastTickTime when starting/resuming
        this.lastTickTime = Date.now();
        this.expectedTime = Date.now() + 1000;
        
        // Request wake lock to prevent sleep
        this.requestWakeLock();
        
        // Start Web Worker timer
        if (this.useWorker) {
            this.worker.postMessage({
                type: 'create',
                id: this.id,
                data: { duration: this.remainingTime }
            });
            this.worker.postMessage({
                type: 'start',
                id: this.id
            });
        }
        
        // Also use regular interval as fallback with drift correction
        this.intervalId = setInterval(() => {
            this.tickWithDriftCorrection();
        }, 100);
    }

    pause() {
        if (!this.isRunning || this.isPaused) return;
        
        this.isPaused = true;
        
        // Pause Web Worker timer
        if (this.useWorker) {
            this.worker.postMessage({
                type: 'pause',
                id: this.id
            });
        }
        
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.lastTickTime = null;
        this.expectedTime = null;
        
        // Release wake lock when paused
        this.releaseWakeLock();
    }

    stop() {
        if (this.sessionStartTime) {
            const sessionDuration = Math.floor((Date.now() - this.sessionStartTime) / 1000);
            this.totalTimeSpent += sessionDuration;
            this.saveProjectTime(sessionDuration);
            this.sessionStartTime = null;
        }
        
        this.isRunning = false;
        this.isPaused = false;
        this.currentIntervalIndex = 0;
        this.currentCycle = 1;
        this.remainingTime = this.intervals[0].duration;
        
        // Stop Web Worker timer
        if (this.useWorker) {
            this.worker.postMessage({
                type: 'stop',
                id: this.id
            });
        }
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.expectedTime = null;
        
        // Release wake lock when stopped
        this.releaseWakeLock();
        
        this.onUpdate();
    }

    saveProjectTime(duration) {
        if (!this.project) return;
        
        const projectData = JSON.parse(localStorage.getItem('projectData') || '{}');
        const today = new Date().toDateString();
        
        if (!projectData[this.project]) {
            projectData[this.project] = {
                totalTime: 0,
                color: this.projectColor,
                sessions: {},
                dailyTime: {}
            };
        }
        
        projectData[this.project].totalTime += duration;
        projectData[this.project].color = this.projectColor;
        
        if (!projectData[this.project].dailyTime[today]) {
            projectData[this.project].dailyTime[today] = 0;
        }
        projectData[this.project].dailyTime[today] += duration;
        
        if (!projectData[this.project].sessions[today]) {
            projectData[this.project].sessions[today] = [];
        }
        projectData[this.project].sessions[today].push({
            duration,
            timestamp: Date.now(),
            timerName: this.name
        });
        
        localStorage.setItem('projectData', JSON.stringify(projectData));
    }

    tick() {
        const now = Date.now();
        const elapsed = Math.floor((now - this.lastTickTime) / 1000);
        
        if (elapsed >= 1) {
            this.remainingTime -= elapsed;
            this.lastTickTime = now - ((now - this.lastTickTime) % 1000);
            
            if (this.remainingTime <= 0) {
                this.handleIntervalComplete();
            }
            
            this.onUpdate();
        }
    }
    
    tickWithDriftCorrection() {
        if (!this.isRunning || this.isPaused) return;
        
        const now = Date.now();
        
        // Use expected time for drift correction
        if (this.expectedTime) {
            const drift = now - this.expectedTime;
            
            // If drift is more than 1 second, correct it
            if (Math.abs(drift) > 1000) {
                console.log('Correcting timer drift:', drift, 'ms');
                const missedSeconds = Math.floor(Math.abs(drift) / 1000);
                if (!this.useWorker) {
                    // Only adjust if worker isn't handling it
                    this.remainingTime = Math.max(0, this.remainingTime - missedSeconds);
                }
                this.expectedTime = now + 1000;
            }
        }
        
        // Fallback tick if worker isn't updating
        const timeSinceLastTick = now - this.lastTickTime;
        if (!this.useWorker || timeSinceLastTick > 1500) {
            const elapsed = Math.floor(timeSinceLastTick / 1000);
            
            if (elapsed >= 1) {
                if (!this.useWorker) {
                    this.remainingTime -= elapsed;
                }
                this.lastTickTime = now - (timeSinceLastTick % 1000);
                
                if (this.remainingTime <= 0) {
                    this.handleIntervalComplete();
                }
                
                this.onUpdate();
            }
        }
        
        // Update expected time for next tick
        if (!this.expectedTime || now >= this.expectedTime) {
            this.expectedTime = now + 1000;
        }
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
        
        // Auto-start next interval if enabled
        if (this.autoStart && this.isRunning) {
            // Update Web Worker with new duration
            if (this.useWorker) {
                this.worker.postMessage({
                    type: 'updateDuration',
                    id: this.id,
                    data: { duration: this.remainingTime }
                });
                this.worker.postMessage({
                    type: 'start',
                    id: this.id
                });
            }
            // Timer continues running automatically
            console.log(`Auto-starting next interval: ${this.getCurrentInterval().label}`);
        } else {
            // Stop and wait for manual start
            this.pause();
        }
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
        
        // Update Web Worker if timer is active
        if (this.useWorker && this.isRunning) {
            this.worker.postMessage({
                type: 'updateDuration',
                id: this.id,
                data: { duration: this.remainingTime }
            });
        }
    }

    updateCycles(cycles) {
        this.totalCycles = cycles;
    }

    getSessionTime() {
        if (!this.sessionStartTime) return 0;
        if (this.isPaused) {
            return this.sessionElapsedTime;
        }
        return Math.floor((Date.now() - this.sessionStartTime) / 1000);
    }
    
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            project: this.project,
            projectColor: this.projectColor,
            intervals: this.intervals,
            totalCycles: this.totalCycles,
            infiniteRepeat: this.infiniteRepeat,
            autoStart: this.autoStart,
            workNotificationText: this.workNotificationText,
            breakNotificationText: this.breakNotificationText,
            currentIntervalIndex: this.currentIntervalIndex,
            currentCycle: this.currentCycle,
            remainingTime: this.remainingTime,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            sessionStartTime: this.sessionStartTime,
            sessionElapsedTime: this.sessionElapsedTime,
            totalTimeSpent: this.totalTimeSpent
        };
    }

    destroy() {
        // Clean up Web Worker
        if (this.useWorker) {
            this.worker.postMessage({
                type: 'destroy',
                id: this.id
            });
            workerCallbacks.delete(this.id);
        }
        
        // Clean up intervals
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        // Release wake lock
        this.releaseWakeLock();
    }
    
    static fromJSON(data, callbacks = {}) {
        const timer = new Timer({
            id: data.id,
            name: data.name,
            project: data.project || '',
            projectColor: data.projectColor || '#4f46e5',
            intervals: data.intervals,
            totalCycles: data.totalCycles,
            infiniteRepeat: data.infiniteRepeat !== undefined ? data.infiniteRepeat : true,
            autoStart: data.autoStart !== undefined ? data.autoStart : true,
            workNotificationText: data.workNotificationText || '',
            breakNotificationText: data.breakNotificationText || '',
            ...callbacks
        });
        
        timer.currentIntervalIndex = data.currentIntervalIndex || 0;
        timer.currentCycle = data.currentCycle || 1;
        timer.remainingTime = data.remainingTime || timer.intervals[0].duration;
        timer.totalTimeSpent = data.totalTimeSpent || 0;
        timer.sessionStartTime = data.sessionStartTime || null;
        timer.sessionElapsedTime = data.sessionElapsedTime || 0;
        
        if (data.isRunning && !data.isPaused) {
            timer.start();
        }
        
        return timer;
    }
}