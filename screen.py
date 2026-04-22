from __future__ import annotations

import queue
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import ttk
from tkinter.scrolledtext import ScrolledText


projectRoot = Path(__file__).resolve().parent

scriptMap = {
    "JobRight": "aJobRight.py",
    "GlassDoor": "bGlassDoor.py",
    "ZipRecruiter": "cZipRecruiter.py",
}


class SaralJobViewerGui:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Saral Job Viewer")
        self.root.geometry("1100x720")
        self.root.minsize(900, 560)
        self.root.configure(bg="#0b1220")

        self.logQueue: queue.Queue[str] = queue.Queue()
        self.activeProcess: subprocess.Popen[str] | None = None
        self.activeScriptName: str | None = None
        self.readerThread: threading.Thread | None = None

        self._configureTheme()
        self._buildUi()
        self._pollLogQueue()
        self.root.protocol("WM_DELETE_WINDOW", self._handleClose)

    def _envPythonPath(self) -> Path:
        if sys.platform.startswith("win"):
            return projectRoot / "env" / "Scripts" / "python.exe"
        return projectRoot / "env" / "bin" / "python"

    def _configureTheme(self) -> None:
        self.bgPrimary = "#0b1220"
        self.bgPanel = "#111b2e"
        self.bgCard = "#162338"
        self.bgLog = "#0a101b"
        self.textPrimary = "#e5ecf5"
        self.textMuted = "#95a4b8"
        self.accent = "#35b4ff"
        self.accentHover = "#57c3ff"
        self.danger = "#ef6b7b"
        self.border = "#2a3d5c"

        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure("App.TFrame", background=self.bgPrimary)
        style.configure("Card.TFrame", background=self.bgPanel)
        style.configure(
            "Title.TLabel",
            background=self.bgPanel,
            foreground=self.textPrimary,
            font=("Segoe UI", 21, "bold"),
        )
        style.configure(
            "Subtitle.TLabel",
            background=self.bgPanel,
            foreground=self.textMuted,
            font=("Segoe UI", 11),
        )
        style.configure(
            "Status.TLabel",
            background=self.bgPanel,
            foreground=self.textMuted,
            font=("Segoe UI", 10, "bold"),
        )
        style.configure(
            "Run.TButton",
            foreground=self.textPrimary,
            background=self.bgCard,
            bordercolor=self.border,
            lightcolor=self.bgCard,
            darkcolor=self.bgCard,
            focusthickness=0,
            padding=(14, 8),
            font=("Segoe UI", 10, "bold"),
        )
        style.map(
            "Run.TButton",
            background=[("active", self.accent), ("disabled", "#26374f")],
            foreground=[("active", "#0b1220"), ("disabled", "#7e8ea3")],
        )
        style.configure(
            "Stop.TButton",
            foreground=self.danger,
            background=self.bgCard,
            bordercolor=self.border,
            lightcolor=self.bgCard,
            darkcolor=self.bgCard,
            focusthickness=0,
            padding=(14, 8),
            font=("Segoe UI", 10, "bold"),
        )
        style.map(
            "Stop.TButton",
            background=[("active", "#332131"), ("disabled", "#26374f")],
            foreground=[("disabled", "#7e8ea3")],
        )

    def _buildUi(self) -> None:
        container = ttk.Frame(self.root, padding=16, style="App.TFrame")
        container.pack(fill=tk.BOTH, expand=True)

        headerCard = ttk.Frame(container, style="Card.TFrame", padding=16)
        headerCard.pack(fill=tk.X, pady=(0, 12))

        titleLabel = ttk.Label(
            headerCard,
            text="Saral Job Viewer",
            style="Title.TLabel",
        )
        titleLabel.pack(anchor="w")

        subtitleLabel = ttk.Label(
            headerCard,
            text="Run scrapers and stream logs live in one place",
            style="Subtitle.TLabel",
        )
        subtitleLabel.pack(anchor="w", pady=(2, 14))

        buttonRow = ttk.Frame(headerCard, style="Card.TFrame")
        buttonRow.pack(fill=tk.X, pady=(0, 10))

        self.runButtons: dict[str, ttk.Button] = {}
        for scriptName in ("JobRight", "GlassDoor", "ZipRecruiter"):
            button = ttk.Button(
                buttonRow,
                text=scriptName,
                command=lambda name=scriptName: self._runScript(name),
                style="Run.TButton",
            )
            button.pack(side=tk.LEFT, padx=(0, 8))
            self.runButtons[scriptName] = button

        self.stopButton = ttk.Button(
            buttonRow,
            text="Stop",
            command=self._stopScript,
            state=tk.DISABLED,
            style="Stop.TButton",
        )
        self.stopButton.pack(side=tk.LEFT, padx=(4, 8))

        clearButton = ttk.Button(
            buttonRow,
            text="Clear Logs",
            command=self._clearLogs,
            style="Run.TButton",
        )
        clearButton.pack(side=tk.LEFT)

        self.statusVar = tk.StringVar(value="Status: Idle")
        statusLabel = ttk.Label(headerCard, textvariable=self.statusVar, style="Status.TLabel")
        statusLabel.pack(anchor="w")

        self.logText = ScrolledText(
            container,
            wrap=tk.WORD,
            font=("Consolas", 10),
            state=tk.DISABLED,
            bg=self.bgLog,
            fg=self.textPrimary,
            insertbackground=self.accent,
            relief=tk.FLAT,
            bd=0,
            padx=12,
            pady=10,
        )
        self.logText.pack(fill=tk.BOTH, expand=True)
        self.logText.configure(highlightthickness=1, highlightbackground=self.border)

    def _appendLog(self, message: str) -> None:
        self.logText.configure(state=tk.NORMAL)
        self.logText.insert(tk.END, message + "\n")
        self.logText.see(tk.END)
        self.logText.configure(state=tk.DISABLED)

    def _clearLogs(self) -> None:
        self.logText.configure(state=tk.NORMAL)
        self.logText.delete("1.0", tk.END)
        self.logText.configure(state=tk.DISABLED)

    def _setButtonsBusy(self, busy: bool) -> None:
        runState = tk.DISABLED if busy else tk.NORMAL
        for button in self.runButtons.values():
            button.configure(state=runState)
        self.stopButton.configure(state=tk.NORMAL if busy else tk.DISABLED)

    def _runScript(self, scriptName: str) -> None:
        if self.activeProcess is not None:
            self._appendLog("A scraper is already running. Stop it first.")
            return

        scriptFile = scriptMap.get(scriptName)
        if not scriptFile:
            self._appendLog(f"Unknown script: {scriptName}")
            return

        scriptPath = projectRoot / scriptFile
        if not scriptPath.is_file():
            self._appendLog(f"Script not found: {scriptPath}")
            return

        pythonPath = self._envPythonPath()
        if not pythonPath.is_file():
            self._appendLog(
                f"env Python not found at: {pythonPath}. "
                "Please create/setup env first."
            )
            self.statusVar.set("Status: Idle (env missing)")
            self._setButtonsBusy(False)
            self.activeProcess = None
            self.activeScriptName = None
            return

        startStamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._appendLog("─" * 96)
        self._appendLog(f"[{startStamp}] Starting {scriptName} ({scriptFile})")
        self._appendLog(f"Using interpreter: {pythonPath}")
        self.statusVar.set(f"Status: Running {scriptName}...")
        self._setButtonsBusy(True)
        self.activeScriptName = scriptName

        try:
            self.activeProcess = subprocess.Popen(
                [str(pythonPath), str(scriptPath)],
                cwd=str(projectRoot),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
        except OSError as exc:
            self._appendLog(f"Failed to start {scriptName}: {exc}")
            self.statusVar.set("Status: Idle")
            self._setButtonsBusy(False)
            self.activeProcess = None
            self.activeScriptName = None
            return

        self.readerThread = threading.Thread(target=self._readProcessOutput, daemon=True)
        self.readerThread.start()

    def _readProcessOutput(self) -> None:
        process = self.activeProcess
        if process is None:
            return

        assert process.stdout is not None
        for line in process.stdout:
            self.logQueue.put(line.rstrip("\n"))

        exitCode = process.wait()
        self.logQueue.put(f"[Process exited with code {exitCode}]")
        self.logQueue.put("__PROCESS_DONE__")

    def _stopScript(self) -> None:
        if self.activeProcess is None:
            return
        self._appendLog("Stopping current scraper...")
        try:
            self.activeProcess.terminate()
        except OSError as exc:
            self._appendLog(f"Failed to stop process cleanly: {exc}")

    def _pollLogQueue(self) -> None:
        try:
            while True:
                message = self.logQueue.get_nowait()
                if message == "__PROCESS_DONE__":
                    finishedName = self.activeScriptName or "scraper"
                    self.statusVar.set(f"Status: Idle (last: {finishedName})")
                    self._setButtonsBusy(False)
                    self.activeProcess = None
                    self.activeScriptName = None
                    self.readerThread = None
                    continue
                self._appendLog(message)
        except queue.Empty:
            pass
        self.root.after(100, self._pollLogQueue)

    def _handleClose(self) -> None:
        if self.activeProcess is not None:
            try:
                self.activeProcess.terminate()
            except OSError:
                pass
        self.root.destroy()


def main() -> None:
    root = tk.Tk()
    app = SaralJobViewerGui(root)
    app  # Keep local reference.
    root.mainloop()


if __name__ == "__main__":
    main()
