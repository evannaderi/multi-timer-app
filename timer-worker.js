// Web Worker for background timer processing
// This runs independently of the main thread and isn't throttled by browsers

const timers = new Map();

class WorkerTimer {
    constructor(id, duration) {
        this.id = id;
        this.duration = duration;
        this.remainingTime = duration;
        this.startTime = null;
        this.pausedTime = 0;
        this.isPaused = false;
        this.isRunning = false;
        this.intervalId = null;
    }

    start() {
        if (this.isRunning && !this.isPaused) return;
        
        if (!this.startTime) {
            this.startTime = Date.now();
        } else if (this.isPaused) {
            // Resume from pause
            this.pausedTime += Date.now() - this.pauseStartTime;
        }
        
        this.isRunning = true;
        this.isPaused = false;
        
        // Use high-frequency checking to ensure accuracy
        this.intervalId = setInterval(() => {
            this.tick();
        }, 100);
    }

    pause() {
        if (!this.isRunning || this.isPaused) return;
        this.isPaused = true;
        this.pauseStartTime = Date.now();
        clearInterval(this.intervalId);
    }

    stop() {
        this.isRunning = false;
        this.isPaused = false;
        this.startTime = null;
        this.pausedTime = 0;
        this.remainingTime = this.duration;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    tick() {
        if (!this.isRunning || this.isPaused) return;
        
        const now = Date.now();
        const totalElapsed = now - this.startTime - this.pausedTime;
        const newRemainingTime = Math.max(0, this.duration - Math.floor(totalElapsed / 1000));
        
        // Only send update if time changed
        if (newRemainingTime !== this.remainingTime) {
            this.remainingTime = newRemainingTime;
            
            self.postMessage({
                type: 'tick',
                id: this.id,
                remainingTime: this.remainingTime,
                timestamp: now
            });
            
            if (this.remainingTime === 0) {
                self.postMessage({
                    type: 'intervalComplete',
                    id: this.id
                });
                this.stop();
            }
        }
    }

    updateDuration(duration) {
        this.duration = duration;
        if (!this.isRunning) {
            this.remainingTime = duration;
        }
    }
}

// Message handler
self.addEventListener('message', (e) => {
    const { type, id, data } = e.data;
    
    switch (type) {
        case 'create':
            timers.set(id, new WorkerTimer(id, data.duration));
            break;
            
        case 'start':
            if (timers.has(id)) {
                timers.get(id).start();
            }
            break;
            
        case 'pause':
            if (timers.has(id)) {
                timers.get(id).pause();
            }
            break;
            
        case 'stop':
            if (timers.has(id)) {
                timers.get(id).stop();
            }
            break;
            
        case 'updateDuration':
            if (timers.has(id)) {
                timers.get(id).updateDuration(data.duration);
            }
            break;
            
        case 'destroy':
            if (timers.has(id)) {
                timers.get(id).stop();
                timers.delete(id);
            }
            break;
            
        case 'heartbeat':
            // Respond to heartbeat to keep connection alive
            self.postMessage({ type: 'heartbeat', timestamp: Date.now() });
            break;
    }
});

// Send heartbeat every 5 seconds to keep worker alive
setInterval(() => {
    self.postMessage({ type: 'heartbeat', timestamp: Date.now() });
}, 5000);