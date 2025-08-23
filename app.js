class TimerManager {
    constructor() {
        this.timers = new Map();
        this.audioContext = null;
        this.init();
    }

    init() {
        this.loadTimersFromStorage();
        this.setupEventListeners();
        this.renderAllTimers();
    }

    setupEventListeners() {
        document.getElementById('new-timer-btn').addEventListener('click', () => {
            this.showTimerModal();
        });

        const modal = document.getElementById('timer-modal');
        const closeBtn = modal.querySelector('.close');
        const saveBtn = document.getElementById('save-timer-btn');
        const cancelBtn = document.getElementById('cancel-timer-btn');
        const addIntervalBtn = document.getElementById('add-interval-btn');
        const infiniteCheckbox = document.getElementById('infinite-repeat');
        const cyclesInput = document.getElementById('repeat-cycles');

        closeBtn.addEventListener('click', () => this.hideTimerModal());
        cancelBtn.addEventListener('click', () => this.hideTimerModal());
        saveBtn.addEventListener('click', () => this.saveTimerFromModal());
        addIntervalBtn.addEventListener('click', () => this.addIntervalInput());

        infiniteCheckbox.addEventListener('change', (e) => {
            cyclesInput.disabled = e.target.checked;
            if (e.target.checked) {
                cyclesInput.value = 1;
            }
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideTimerModal();
            }
        });
    }

    showTimerModal(timerId = null) {
        const modal = document.getElementById('timer-modal');
        modal.style.display = 'block';
        modal.dataset.timerId = timerId || '';

        if (timerId && this.timers.has(timerId)) {
            const timer = this.timers.get(timerId);
            document.getElementById('timer-name').value = timer.name;
            document.getElementById('infinite-repeat').checked = timer.infiniteRepeat;
            document.getElementById('repeat-cycles').value = timer.totalCycles > 0 ? timer.totalCycles : 1;
            document.getElementById('repeat-cycles').disabled = timer.infiniteRepeat;
            document.getElementById('work-notification-text').value = timer.workNotificationText || '';
            document.getElementById('break-notification-text').value = timer.breakNotificationText || '';
            this.renderIntervals(timer.intervals);
        } else {
            document.getElementById('timer-name').value = '';
            document.getElementById('infinite-repeat').checked = true;
            document.getElementById('repeat-cycles').value = 1;
            document.getElementById('repeat-cycles').disabled = true;
            document.getElementById('work-notification-text').value = '';
            document.getElementById('break-notification-text').value = '';
            this.renderIntervals([
                { duration: 25 * 60, type: 'work', label: 'Work' },
                { duration: 5 * 60, type: 'break', label: 'Break' }
            ]);
        }
    }

    hideTimerModal() {
        const modal = document.getElementById('timer-modal');
        modal.style.display = 'none';
        modal.dataset.timerId = '';
    }

    renderIntervals(intervals) {
        const container = document.getElementById('intervals-list');
        container.innerHTML = '';

        intervals.forEach((interval, index) => {
            const div = document.createElement('div');
            div.className = 'interval-item';
            div.innerHTML = `
                <input type="text" class="interval-label" placeholder="Label" value="${interval.label}">
                <input type="number" class="interval-duration" placeholder="Minutes" min="1" value="${Math.floor(interval.duration / 60)}">
                <select class="interval-type">
                    <option value="work" ${interval.type === 'work' ? 'selected' : ''}>Work</option>
                    <option value="break" ${interval.type === 'break' ? 'selected' : ''}>Break</option>
                </select>
                <button class="remove-interval-btn" data-index="${index}">×</button>
            `;
            container.appendChild(div);
        });

        container.querySelectorAll('.remove-interval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.removeIntervalInput(index);
            });
        });
    }

    addIntervalInput() {
        const container = document.getElementById('intervals-list');
        const currentIntervals = this.getIntervalsFromModal();
        currentIntervals.push({ duration: 5 * 60, type: 'break', label: 'Break' });
        this.renderIntervals(currentIntervals);
    }

    removeIntervalInput(index) {
        const currentIntervals = this.getIntervalsFromModal();
        if (currentIntervals.length > 1) {
            currentIntervals.splice(index, 1);
            this.renderIntervals(currentIntervals);
        }
    }

    getIntervalsFromModal() {
        const intervals = [];
        const items = document.querySelectorAll('.interval-item');
        
        items.forEach(item => {
            const label = item.querySelector('.interval-label').value || 'Interval';
            const duration = parseInt(item.querySelector('.interval-duration').value) * 60 || 60;
            const type = item.querySelector('.interval-type').value;
            intervals.push({ duration, type, label });
        });
        
        return intervals;
    }

    saveTimerFromModal() {
        const modal = document.getElementById('timer-modal');
        const timerId = modal.dataset.timerId;
        const name = document.getElementById('timer-name').value || 'Unnamed Timer';
        const intervals = this.getIntervalsFromModal();
        const infiniteRepeat = document.getElementById('infinite-repeat').checked;
        const totalCycles = infiniteRepeat ? -1 : (parseInt(document.getElementById('repeat-cycles').value) || 1);
        const workNotificationText = document.getElementById('work-notification-text').value || '';
        const breakNotificationText = document.getElementById('break-notification-text').value || '';

        if (timerId && this.timers.has(timerId)) {
            const timer = this.timers.get(timerId);
            timer.name = name;
            timer.updateIntervals(intervals);
            timer.updateCycles(totalCycles);
            timer.infiniteRepeat = infiniteRepeat;
            timer.workNotificationText = workNotificationText;
            timer.breakNotificationText = breakNotificationText;
        } else {
            const timer = new Timer({
                name,
                intervals,
                totalCycles,
                infiniteRepeat,
                workNotificationText,
                breakNotificationText,
                onUpdate: () => this.updateTimerDisplay(timer.id),
                onComplete: () => this.handleTimerComplete(timer.id),
                onIntervalComplete: (interval) => this.handleIntervalComplete(timer.id, interval)
            });
            this.timers.set(timer.id, timer);
        }

        this.saveTimersToStorage();
        this.renderAllTimers();
        this.hideTimerModal();
    }

    createTimer(config) {
        const timer = new Timer({
            ...config,
            onUpdate: () => this.updateTimerDisplay(timer.id),
            onComplete: () => this.handleTimerComplete(timer.id),
            onIntervalComplete: (interval) => this.handleIntervalComplete(timer.id, interval)
        });
        
        this.timers.set(timer.id, timer);
        this.saveTimersToStorage();
        this.renderAllTimers();
        return timer;
    }

    deleteTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (timer) {
            timer.stop();
            this.timers.delete(timerId);
            this.saveTimersToStorage();
            this.renderAllTimers();
        }
    }

    renderAllTimers() {
        const container = document.getElementById('timers-container');
        container.innerHTML = '';

        if (this.timers.size === 0) {
            container.innerHTML = '<div class="empty-state">No timers yet. Click "New Timer" to create one!</div>';
            return;
        }

        this.timers.forEach(timer => {
            container.appendChild(this.createTimerElement(timer));
        });
    }

    createTimerElement(timer) {
        const div = document.createElement('div');
        div.className = 'timer-card';
        div.id = `timer-${timer.id}`;
        
        const currentInterval = timer.getCurrentInterval();
        const progress = timer.getProgress();
        
        div.innerHTML = `
            <div class="timer-header">
                <h3>${timer.name}</h3>
                <div class="timer-actions">
                    <button class="icon-btn edit-btn" data-id="${timer.id}" title="Edit">✏️</button>
                    <button class="icon-btn delete-btn" data-id="${timer.id}" title="Delete">🗑️</button>
                </div>
            </div>
            <div class="timer-display">
                <div class="timer-time">${timer.getFormattedTime()}</div>
                <div class="timer-interval">${currentInterval.label} (${timer.infiniteRepeat ? `Cycle ${timer.currentCycle}` : `${timer.currentCycle}/${timer.totalCycles}`})</div>
            </div>
            <div class="timer-progress">
                <div class="progress-bar">
                    <div class="progress-fill ${currentInterval.type}" style="width: ${progress}%"></div>
                </div>
            </div>
            <div class="timer-controls">
                ${timer.getStatus() === 'running' 
                    ? `<button class="control-btn pause-btn" data-id="${timer.id}">Pause</button>`
                    : `<button class="control-btn start-btn" data-id="${timer.id}">Start</button>`
                }
                <button class="control-btn stop-btn" data-id="${timer.id}">Reset</button>
            </div>
            <div class="timer-intervals">
                ${timer.intervals.map((interval, i) => 
                    `<span class="interval-tag ${i === timer.currentIntervalIndex ? 'active' : ''}">${interval.label}</span>`
                ).join('')}
            </div>
        `;

        this.attachTimerEventListeners(div, timer.id);
        return div;
    }

    attachTimerEventListeners(element, timerId) {
        const editBtn = element.querySelector('.edit-btn');
        const deleteBtn = element.querySelector('.delete-btn');
        const startBtn = element.querySelector('.start-btn');
        const pauseBtn = element.querySelector('.pause-btn');
        const stopBtn = element.querySelector('.stop-btn');

        if (editBtn) editBtn.addEventListener('click', () => this.showTimerModal(timerId));
        if (deleteBtn) deleteBtn.addEventListener('click', () => {
            if (confirm('Delete this timer?')) {
                this.deleteTimer(timerId);
            }
        });
        if (startBtn) startBtn.addEventListener('click', () => {
            const timer = this.timers.get(timerId);
            timer.start();
            this.updateTimerDisplay(timerId);
        });
        if (pauseBtn) pauseBtn.addEventListener('click', () => {
            const timer = this.timers.get(timerId);
            timer.pause();
            this.updateTimerDisplay(timerId);
        });
        if (stopBtn) stopBtn.addEventListener('click', () => {
            const timer = this.timers.get(timerId);
            timer.stop();
            this.updateTimerDisplay(timerId);
        });
    }

    updateTimerDisplay(timerId) {
        const timer = this.timers.get(timerId);
        const element = document.getElementById(`timer-${timerId}`);
        if (!timer || !element) return;

        const currentInterval = timer.getCurrentInterval();
        const progress = timer.getProgress();

        element.querySelector('.timer-time').textContent = timer.getFormattedTime();
        element.querySelector('.timer-interval').textContent = `${currentInterval.label} (${timer.infiniteRepeat ? `Cycle ${timer.currentCycle}` : `${timer.currentCycle}/${timer.totalCycles}`})`;
        
        const progressFill = element.querySelector('.progress-fill');
        progressFill.style.width = `${progress}%`;
        progressFill.className = `progress-fill ${currentInterval.type}`;

        const controlsDiv = element.querySelector('.timer-controls');
        controlsDiv.innerHTML = `
            ${timer.getStatus() === 'running' 
                ? `<button class="control-btn pause-btn" data-id="${timer.id}">Pause</button>`
                : `<button class="control-btn start-btn" data-id="${timer.id}">Start</button>`
            }
            <button class="control-btn stop-btn" data-id="${timer.id}">Reset</button>
        `;
        this.attachTimerEventListeners(element, timerId);

        const intervalTags = element.querySelectorAll('.interval-tag');
        intervalTags.forEach((tag, i) => {
            tag.classList.toggle('active', i === timer.currentIntervalIndex);
        });

        this.saveTimersToStorage();
    }

    handleIntervalComplete(timerId, interval) {
        const timer = this.timers.get(timerId);
        this.playNotificationSound(interval.type);
        let message;
        if (interval.type === 'work') {
            message = timer.workNotificationText || `${interval.label} complete!`;
        } else {
            message = timer.breakNotificationText || `${interval.label} complete!`;
        }
        this.showNotification(message);
    }

    handleTimerComplete(timerId) {
        const timer = this.timers.get(timerId);
        this.playNotificationSound('complete');
        const message = `${timer.name} complete!`;
        this.showNotification(message);
    }

    playNotificationSound(type) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        if (type === 'work') {
            oscillator.frequency.value = 880;
            gainNode.gain.value = 0.3;
        } else if (type === 'break') {
            oscillator.frequency.value = 440;
            gainNode.gain.value = 0.2;
        } else {
            oscillator.frequency.value = 660;
            gainNode.gain.value = 0.4;
        }

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.2);
    }

    showNotification(message) {
        // Desktop notification
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification('Timer Alert', { 
                    body: message,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234f46e5"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>',
                    tag: 'timer-notification',
                    requireInteraction: false
                });
            } else if (Notification.permission === 'default') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification('Timer Alert', { 
                            body: message,
                            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234f46e5"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/></svg>',
                            tag: 'timer-notification',
                            requireInteraction: false
                        });
                    }
                });
            }
        }

        // In-app notification
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    saveTimersToStorage() {
        const timersData = Array.from(this.timers.values()).map(timer => timer.toJSON());
        localStorage.setItem('timers', JSON.stringify(timersData));
    }

    loadTimersFromStorage() {
        const stored = localStorage.getItem('timers');
        if (stored) {
            try {
                const timersData = JSON.parse(stored);
                timersData.forEach(data => {
                    const timer = Timer.fromJSON(data, {
                        onUpdate: () => this.updateTimerDisplay(data.id),
                        onComplete: () => this.handleTimerComplete(data.id),
                        onIntervalComplete: (interval) => this.handleIntervalComplete(data.id, interval)
                    });
                    this.timers.set(timer.id, timer);
                });
            } catch (e) {
                console.error('Failed to load timers:', e);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    new TimerManager();
});