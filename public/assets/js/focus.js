// Focus Mode Timer Component
function focusModeComponent() {
    return {
        flowModeOpen: false,
        timerActive: false,
        timerPaused: false,
        timerSeconds: 25 * 60, // 25 minutes default (Pomodoro)
        intervalId: null,
        preset: 25,

        openFlowMode() {
            this.flowModeOpen = true;
            this.timerSeconds = this.preset * 60;
            this.timerActive = false;
            this.timerPaused = false;
        },

        closeFlowMode() {
            this.flowModeOpen = false;
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            this.timerActive = false;
        },

        setPreset(minutes) {
            if (!this.timerActive) {
                this.preset = minutes;
                this.timerSeconds = minutes * 60;
            }
        },

        startTimer() {
            if (this.timerPaused) {
                this.timerPaused = false;
            } else {
                this.timerActive = true;
            }

            this.intervalId = setInterval(() => {
                if (this.timerSeconds > 0 && !this.timerPaused) {
                    this.timerSeconds--;
                } else if (this.timerSeconds === 0) {
                    this.completeSession();
                }
            }, 1000);
        },

        pauseTimer() {
            this.timerPaused = true;
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        },

        resetTimer() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            this.timerActive = false;
            this.timerPaused = false;
            this.timerSeconds = this.preset * 60;
        },

        async completeSession() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }

            const minutesCompleted = this.preset;

            // Play completion sound (could add audio here)
            this.showToast(`🎉 Flow session complete! ${minutesCompleted} minutes focused.`, 'success');

            // Send to server
            const res = await fetch('./api/focus/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minutes: minutesCompleted })
            });
            const data = await res.json();

            if (data.leveledUp) {
                this.showToast(`🎊 Level Up! You reached Level ${data.newLevel}!`, 'info');
            }

            await this.loadMetrics();
            this.resetTimer();
            this.flowModeOpen = false;
        },

        formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    };
}
