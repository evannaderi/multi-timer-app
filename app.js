class TimerManager {
    constructor() {
        this.timers = new Map();
        this.audioContext = null;
        this.init();
    }

    init() {
        this.loadTimersFromStorage();
        this.setupEventListeners();
        this.setupVisibilityHandler();
        this.setupHeartbeatSystem();
        this.renderAllTimers();
        this.updateDashboard();
        this.startDashboardUpdater();
    }

    setupEventListeners() {
        document.getElementById('new-timer-btn').addEventListener('click', () => {
            this.showTimerModal();
        });

        document.getElementById('timers-view-btn').addEventListener('click', () => {
            this.showView('timers');
        });

        document.getElementById('dashboard-view-btn').addEventListener('click', () => {
            this.showView('dashboard');
            this.updateDashboard();
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
        
        // Add preset button listeners when modal opens
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('preset-btn')) {
                const preset = e.target.dataset.preset;
                this.applyPreset(preset);
            }
        });

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

    setupHeartbeatSystem() {
        // Heartbeat every second to ensure timers stay accurate
        setInterval(() => {
            this.timers.forEach(timer => {
                if (timer.isRunning && !timer.isPaused) {
                    // Check if timer appears to be stuck
                    const now = Date.now();
                    const timeSinceLastUpdate = now - (timer.lastTickTime || now);
                    
                    if (timeSinceLastUpdate > 2000) {
                        console.log(`Timer ${timer.id} appears stuck, forcing update`);
                        const missedSeconds = Math.floor(timeSinceLastUpdate / 1000);
                        
                        if (!timer.useWorker) {
                            timer.remainingTime = Math.max(0, timer.remainingTime - missedSeconds);
                        }
                        
                        timer.lastTickTime = now;
                        timer.onUpdate();
                        
                        // Check for completion
                        if (timer.remainingTime === 0) {
                            timer.handleIntervalComplete();
                        }
                    }
                }
            });
        }, 1000);
        
        // Keep worker alive with periodic heartbeat
        setInterval(() => {
            if (window.sharedWorker) {
                window.sharedWorker.postMessage({ type: 'heartbeat' });
            }
        }, 5000);
    }
    
    setupVisibilityHandler() {
        let hiddenTime = null;
        
        // Track when tab becomes hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Tab became hidden, record the time
                hiddenTime = Date.now();
                console.log('Tab hidden at:', hiddenTime);
            } else {
                // Tab became visible again
                if (hiddenTime) {
                    const hiddenDuration = Date.now() - hiddenTime;
                    console.log('Tab was hidden for:', hiddenDuration, 'ms');
                    
                    // Correct all running timers for the time spent hidden
                    this.timers.forEach(timer => {
                        if (timer.isRunning && !timer.isPaused) {
                            // Calculate how many seconds were missed
                            const missedSeconds = Math.floor(hiddenDuration / 1000);
                            
                            if (missedSeconds > 0) {
                                console.log(`Correcting timer ${timer.id} by ${missedSeconds} seconds`);
                                
                                // If using worker, it should have kept accurate time
                                // This is a fallback correction
                                if (!timer.useWorker) {
                                    timer.remainingTime = Math.max(0, timer.remainingTime - missedSeconds);
                                    
                                    // Check if timer should have completed
                                    while (timer.remainingTime === 0 && timer.isRunning) {
                                        timer.handleIntervalComplete();
                                    }
                                }
                                
                                // Force UI update
                                timer.onUpdate();
                            }
                        }
                    });
                    
                    hiddenTime = null;
                }
            }
        });
        
        // Also handle focus/blur events as additional safeguard
        window.addEventListener('blur', () => {
            if (!hiddenTime) {
                hiddenTime = Date.now();
            }
        });
        
        window.addEventListener('focus', () => {
            if (hiddenTime) {
                const hiddenDuration = Date.now() - hiddenTime;
                if (hiddenDuration > 2000) { // Only correct if hidden for more than 2 seconds
                    this.timers.forEach(timer => {
                        if (timer.isRunning && !timer.isPaused) {
                            timer.onUpdate();
                        }
                    });
                }
                hiddenTime = null;
            }
        });
    }

    showView(viewName) {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        document.getElementById(`${viewName}-view`).classList.add('active');
        document.getElementById(`${viewName}-view-btn`).classList.add('active');
    }

    showTimerModal(timerId = null) {
        const modal = document.getElementById('timer-modal');
        modal.style.display = 'block';
        modal.dataset.timerId = timerId || '';

        this.populateProjectsList();

        if (timerId && this.timers.has(timerId)) {
            const timer = this.timers.get(timerId);
            document.getElementById('timer-name').value = timer.name;
            document.getElementById('timer-project').value = timer.project || '';
            document.getElementById('timer-color').value = timer.projectColor || '#4f46e5';
            document.getElementById('infinite-repeat').checked = timer.infiniteRepeat;
            document.getElementById('repeat-cycles').value = timer.totalCycles > 0 ? timer.totalCycles : 1;
            document.getElementById('repeat-cycles').disabled = timer.infiniteRepeat;
            document.getElementById('auto-start').checked = timer.autoStart !== undefined ? timer.autoStart : true;
            document.getElementById('work-notification-text').value = timer.workNotificationText || '';
            document.getElementById('break-notification-text').value = timer.breakNotificationText || '';
            this.renderIntervals(timer.intervals);
        } else {
            document.getElementById('timer-name').value = '';
            document.getElementById('timer-project').value = '';
            document.getElementById('timer-color').value = '#4f46e5';
            document.getElementById('infinite-repeat').checked = true;
            document.getElementById('repeat-cycles').value = 1;
            document.getElementById('repeat-cycles').disabled = true;
            document.getElementById('auto-start').checked = true; // Default to auto-start enabled
            document.getElementById('work-notification-text').value = '';
            document.getElementById('break-notification-text').value = '';
            // Check if user wants 20-20-20 rule preset
            const use202020 = window.location.hash === '#202020';
            if (use202020) {
                this.renderIntervals([
                    { duration: 20 * 60, type: 'work', label: 'Look at screen' },
                    { duration: 20, type: 'break', label: 'Look 20ft away' }
                ]);
            } else {
                this.renderIntervals([
                    { duration: 25 * 60, type: 'work', label: 'Work' },
                    { duration: 5 * 60, type: 'break', label: 'Break' }
                ]);
            }
        }
    }

    populateProjectsList() {
        const projectData = JSON.parse(localStorage.getItem('projectData') || '{}');
        const datalist = document.getElementById('projects-list');
        datalist.innerHTML = '';
        
        Object.keys(projectData).forEach(project => {
            const option = document.createElement('option');
            option.value = project;
            datalist.appendChild(option);
        });
    }

    applyPreset(preset) {
        let intervals = [];
        let notificationWork = '';
        let notificationBreak = '';
        
        switch(preset) {
            case 'pomodoro':
                intervals = [
                    { duration: 25 * 60, type: 'work', label: 'Focus' },
                    { duration: 5 * 60, type: 'break', label: 'Short Break' }
                ];
                break;
            case '202020':
                intervals = [
                    { duration: 20 * 60, type: 'work', label: 'Screen Time' },
                    { duration: 20, type: 'break', label: 'Eye Rest (20ft)' }
                ];
                notificationWork = 'Time to rest your eyes!';
                notificationBreak = 'You can look back at your screen';
                document.getElementById('timer-name').value = '20-20-20 Eye Care';
                break;
            case '52-17':
                intervals = [
                    { duration: 52 * 60, type: 'work', label: 'Deep Work' },
                    { duration: 17 * 60, type: 'break', label: 'Recovery' }
                ];
                break;
        }
        
        this.renderIntervals(intervals);
        if (notificationWork) {
            document.getElementById('work-notification-text').value = notificationWork;
        }
        if (notificationBreak) {
            document.getElementById('break-notification-text').value = notificationBreak;
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
            const minutes = Math.floor(interval.duration / 60);
            const seconds = interval.duration % 60;
            const timeValue = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const div = document.createElement('div');
            div.className = 'interval-item';
            div.innerHTML = `
                <input type="text" class="interval-label" placeholder="Label" value="${interval.label}">
                <input type="text" class="interval-duration" placeholder="MM:SS" pattern="[0-9]+:[0-9]{2}" value="${timeValue}">
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
        currentIntervals.push({ duration: 20, type: 'break', label: 'Break' });
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
            const timeValue = item.querySelector('.interval-duration').value || '1:00';
            
            // Parse MM:SS or just minutes
            let duration;
            if (timeValue.includes(':')) {
                const [minutes, seconds] = timeValue.split(':').map(v => parseInt(v) || 0);
                duration = minutes * 60 + seconds;
            } else {
                // Backward compatibility: if just a number, treat as minutes
                duration = parseInt(timeValue) * 60 || 60;
            }
            
            const type = item.querySelector('.interval-type').value;
            intervals.push({ duration, type, label });
        });
        
        return intervals;
    }

    saveTimerFromModal() {
        const modal = document.getElementById('timer-modal');
        const timerId = modal.dataset.timerId;
        const name = document.getElementById('timer-name').value || 'Unnamed Timer';
        const project = document.getElementById('timer-project').value || '';
        const projectColor = document.getElementById('timer-color').value || '#4f46e5';
        const intervals = this.getIntervalsFromModal();
        const infiniteRepeat = document.getElementById('infinite-repeat').checked;
        const totalCycles = infiniteRepeat ? -1 : (parseInt(document.getElementById('repeat-cycles').value) || 1);
        const autoStart = document.getElementById('auto-start').checked;
        const workNotificationText = document.getElementById('work-notification-text').value || '';
        const breakNotificationText = document.getElementById('break-notification-text').value || '';

        if (timerId && this.timers.has(timerId)) {
            const timer = this.timers.get(timerId);
            timer.name = name;
            timer.project = project;
            timer.projectColor = projectColor;
            timer.updateIntervals(intervals);
            timer.updateCycles(totalCycles);
            timer.infiniteRepeat = infiniteRepeat;
            timer.autoStart = autoStart;
            timer.workNotificationText = workNotificationText;
            timer.breakNotificationText = breakNotificationText;
        } else {
            const timer = new Timer({
                name,
                project,
                projectColor,
                intervals,
                totalCycles,
                infiniteRepeat,
                autoStart,
                workNotificationText,
                breakNotificationText,
                onUpdate: () => this.updateTimerDisplay(timer.id),
                onComplete: () => this.handleTimerComplete(timer.id),
                onIntervalComplete: (interval) => this.handleIntervalComplete(timer.id, interval)
            });
            this.timers.set(timer.id, timer);
        }

        // Initialize project in localStorage if it doesn't exist
        if (project) {
            const projectData = JSON.parse(localStorage.getItem('projectData') || '{}');
            if (!projectData[project]) {
                projectData[project] = {
                    totalTime: 0,
                    color: projectColor,
                    sessions: {},
                    dailyTime: {}
                };
                localStorage.setItem('projectData', JSON.stringify(projectData));
            } else {
                // Update color if it changed
                projectData[project].color = projectColor;
                localStorage.setItem('projectData', JSON.stringify(projectData));
            }
        }

        this.saveTimersToStorage();
        this.renderAllTimers();
        this.updateDashboard();
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
        
        if (timer.project) {
            div.style.borderLeft = `4px solid ${timer.projectColor}`;
        }
        
        const currentInterval = timer.getCurrentInterval();
        const progress = timer.getProgress();
        
        div.innerHTML = `
            <div class="timer-header">
                <div>
                    <h3>${timer.name}</h3>
                    ${timer.project ? `<div class="timer-project" style="color: ${timer.projectColor}">${timer.project}</div>` : ''}
                </div>
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

    updateDashboard() {
        const projectData = JSON.parse(localStorage.getItem('projectData') || '{}');
        const today = new Date().toDateString();
        
        let totalTimeToday = 0;
        let sessionsToday = 0;
        const allProjects = new Set();
        const projectTimes = {};

        // Count projects from stored data
        Object.entries(projectData).forEach(([project, data]) => {
            allProjects.add(project);
            if (data.dailyTime && data.dailyTime[today]) {
                totalTimeToday += data.dailyTime[today];
                projectTimes[project] = data.dailyTime[today];
            }
            if (data.sessions && data.sessions[today]) {
                sessionsToday += data.sessions[today].length;
            }
        });

        // Also count projects from timers
        this.timers.forEach(timer => {
            if (timer.project) {
                allProjects.add(timer.project);
            }
        });

        document.getElementById('total-time-today').textContent = this.formatTime(totalTimeToday);
        document.getElementById('active-projects').textContent = allProjects.size;
        document.getElementById('sessions-today').textContent = sessionsToday;

        this.renderProjectChart(projectTimes);
        this.renderProjectDetails(projectData);
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    renderProjectChart(projectTimes) {
        const container = document.getElementById('projects-chart');
        container.innerHTML = '';

        if (Object.keys(projectTimes).length === 0) {
            container.innerHTML = '<div class="no-data">No project data for today</div>';
            return;
        }

        const total = Object.values(projectTimes).reduce((a, b) => a + b, 0);
        const projectData = JSON.parse(localStorage.getItem('projectData') || '{}');

        Object.entries(projectTimes).forEach(([project, time]) => {
            const percentage = (time / total) * 100;
            const bar = document.createElement('div');
            bar.className = 'project-bar';
            bar.innerHTML = `
                <div class="project-bar-label">
                    <span class="project-name">${project}</span>
                    <span class="project-time">${this.formatTime(time)}</span>
                </div>
                <div class="project-bar-track">
                    <div class="project-bar-fill" style="width: ${percentage}%; background: ${projectData[project]?.color || '#4f46e5'}"></div>
                </div>
                <div class="project-percentage">${percentage.toFixed(1)}%</div>
            `;
            container.appendChild(bar);
        });
    }

    renderProjectDetails(projectData) {
        const container = document.getElementById('projects-details');
        container.innerHTML = '';

        // Also include projects from active timers even if no time tracked yet
        const allProjects = { ...projectData };
        this.timers.forEach(timer => {
            if (timer.project && !allProjects[timer.project]) {
                allProjects[timer.project] = {
                    totalTime: 0,
                    color: timer.projectColor,
                    sessions: {},
                    dailyTime: {}
                };
            }
        });

        if (Object.keys(allProjects).length === 0) {
            container.innerHTML = '<div class="no-data">No projects tracked yet</div>';
            return;
        }

        Object.entries(allProjects).forEach(([project, data]) => {
            const card = document.createElement('div');
            card.className = 'project-detail-card';
            card.style.borderLeft = `4px solid ${data.color}`;
            
            const totalHours = (data.totalTime / 3600).toFixed(1);
            const sessionsCount = Object.values(data.sessions || {}).flat().length;
            
            card.innerHTML = `
                <div class="project-detail-header">
                    <h3 style="color: ${data.color}">${project}</h3>
                </div>
                <div class="project-stats">
                    <div class="project-stat">
                        <span class="stat-label">Total Time</span>
                        <span class="stat-value">${totalHours}h</span>
                    </div>
                    <div class="project-stat">
                        <span class="stat-label">Sessions</span>
                        <span class="stat-value">${sessionsCount}</span>
                    </div>
                    <div class="project-stat">
                        <span class="stat-label">Avg Session</span>
                        <span class="stat-value">${sessionsCount > 0 ? Math.round(data.totalTime / sessionsCount / 60) : 0}m</span>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    startDashboardUpdater() {
        setInterval(() => {
            if (document.getElementById('dashboard-view').classList.contains('active')) {
                this.updateDashboard();
            }
        }, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    new TimerManager();
});