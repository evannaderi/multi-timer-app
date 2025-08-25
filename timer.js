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
        this.workNotificationText = config.workNotificationText || '';
        this.breakNotificationText = config.breakNotificationText || '';
        this.remainingTime = this.intervals[0].duration;
        this.isRunning = false;
        this.isPaused = false;
        this.intervalId = null;
        this.sessionStartTime = null;
        this.totalTimeSpent = 0;
        this.lastTickTime = null;
        this.onUpdate = config.onUpdate || (() => {});
        this.onComplete = config.onComplete || (() => {});
        this.onIntervalComplete = config.onIntervalComplete || (() => {});
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
        
        this.intervalId = setInterval(() => {
            this.tick();
        }, 100);
    }

    pause() {
        if (!this.isRunning || this.isPaused) return;
        
        this.isPaused = true;
        clearInterval(this.intervalId);
        this.intervalId = null;
        this.lastTickTime = null;
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
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
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
            project: this.project,
            projectColor: this.projectColor,
            intervals: this.intervals,
            totalCycles: this.totalCycles,
            infiniteRepeat: this.infiniteRepeat,
            workNotificationText: this.workNotificationText,
            breakNotificationText: this.breakNotificationText,
            currentIntervalIndex: this.currentIntervalIndex,
            currentCycle: this.currentCycle,
            remainingTime: this.remainingTime,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            totalTimeSpent: this.totalTimeSpent
        };
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
            workNotificationText: data.workNotificationText || '',
            breakNotificationText: data.breakNotificationText || '',
            ...callbacks
        });
        
        timer.currentIntervalIndex = data.currentIntervalIndex || 0;
        timer.currentCycle = data.currentCycle || 1;
        timer.remainingTime = data.remainingTime || timer.intervals[0].duration;
        timer.totalTimeSpent = data.totalTimeSpent || 0;
        
        if (data.isRunning && !data.isPaused) {
            timer.start();
        }
        
        return timer;
    }
}