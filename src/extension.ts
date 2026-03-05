import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ollama from 'ollama';


// Interview state management
// ===========================================
// ADD THIS INTERFACE (with your other interfaces)
// ===========================================
interface SessionEvent {
    type: 'keystroke' | 'paste' | 'error' | 'pause' | 'focus-loss';
    timestamp: Date;
    lineNumber?: number;
    details?: string;
}
interface InterviewSession {
    sessionId: string;
    code: string;
    startTime: Date;
    endTime?: Date;
    interviewerId?: string;
    candidateName?: string;
    pasteAttempts: number;
    focusLosses: number;
    events: SessionEvent[];
    aiDetectionScore?: number;
    recording: {
        keystrokes: KeystrokeRecord[];
        timeline: TimelineEvent[];
        fileSnapshots: FileSnapshot[];
    };
}

interface KeystrokeRecord {
    timestamp: Date;
    key: string;
    line: number;
    character: number;
    timeFromStart: number; // milliseconds
}

interface TimelineEvent {
    timestamp: Date;
    type: 'file-open' | 'file-close' | 'focus-loss' | 'error' | 'pause';
    details: string;
    timeFromStart: number;
}

interface FileSnapshot {
    timestamp: Date;
    content: string;
    reason: 'auto' | 'manual' | 'session-end';
    timeFromStart: number;
}
// ===========================================
// GLOBAL VARIABLES
// ===========================================
let activeSession: InterviewSession | null = null;
let pasteAttempts = 0;
let focusLossCount = 0;
let focusDisposable: vscode.Disposable;
let keystrokeDisposable: vscode.Disposable;
let pauseTimeout: NodeJS.Timeout;
let lastKeystrokeTime: number;
let statusBarItem: vscode.StatusBarItem | undefined;  // 👈 ADD THIS LINE


export function activate(context: vscode.ExtensionContext) {
    console.log('✅ CodeMentor is NOW ACTIVE!');

    // Hello World command (keep for testing)
    const helloCommand = vscode.commands.registerCommand('CodeMentor.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from CodeMentor!');
    });

    // MAIN ANALYZE COMMAND
    const analyzeCommand = vscode.commands.registerCommand('CodeMentor.analyze', async () => {
        // Get current file
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No file open!');
            return;
        }

        const document = editor.document;
        const fileName = document.fileName;
        const fileContent = document.getText();
        const language = document.languageId;

        // Show progress bar
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "CodeMentor Analyzing...",
            cancellable: false
        }, async (progress) => {
            
            progress.report({ message: "Checking code...", increment: 20 });

            // SIMULATED ANALYSIS (for demo)
            // Later replace with real linters
            const errors = await realAIAnalysis(fileContent, language);
            progress.report({ message: "Generating feedback...", increment: 60 });

            // Show results in webview
            showResultsPanel(context, errors, fileName, language);
            
            progress.report({ message: "Done!", increment: 100 });
            
            // Show success message
            vscode.window.showInformationMessage(`Analysis complete! Found ${errors.length} issues.`);
        });
    });

    // Register paste blocker
    const pasteDisposable = vscode.commands.registerCommand('editor.action.clipboardPasteAction', async () => {
        if (activeSession) {
            // Interview mode is active - block paste
            pasteAttempts++;
            
            // Log the paste attempt
            if (activeSession) {
                activeSession.pasteAttempts = pasteAttempts;
                activeSession.events.push({
                    type: 'paste',
                    timestamp: new Date(),
                    details: 'Paste attempt blocked'
                });
            }
            
            vscode.window.showWarningMessage('⚠️ Pasting is disabled during interview mode');
            return; // Block the paste
        } else {
            // Normal mode - allow paste
            return vscode.commands.executeCommand('default:clipboard.paste');
        }
    });

    // Generate interview code command
    const generateCodeCommand = vscode.commands.registerCommand('CodeMentor.generateInterviewCode', async () => {
        // Generate random 6-digit code
        const interviewCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store in global storage
        const panel = vscode.window.createWebviewPanel(
            'interviewCode',
            'Interview Code',
            vscode.ViewColumn.Active,
            { enableScripts: true }
        );
        
        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        padding: 40px;
                        text-align: center;
                        background: #1e1e1e;
                        color: white;
                    }
                    .code-box {
                        font-size: 72px;
                        font-weight: bold;
                        color: #007acc;
                        background: #2d2d2d;
                        padding: 30px;
                        border-radius: 10px;
                        letter-spacing: 10px;
                        margin: 30px 0;
                    }
                    .instruction {
                        color: #cccccc;
                        font-size: 18px;
                    }
                    .warning {
                        color: #ff9800;
                        margin-top: 20px;
                    }
                </style>
            </head>
            <body>
                <h1>🔐 Interview Code</h1>
                <div class="code-box">${interviewCode}</div>
                <p class="instruction">Share this code with the candidate</p>
                <p class="instruction">They must enter it before starting</p>
                <p class="warning">⏰ Code expires in 2 hours</p>
            </body>
            </html>
        `;
        
        // Save code to global storage
        await context.globalState.update('interviewCode', {code: interviewCode, timestamp: Date.now()});
    });

    // Enter interview code command
    const enterCodeCommand = vscode.commands.registerCommand('CodeMentor.enterInterviewCode', async () => {
        const code = await vscode.window.showInputBox({
            prompt: 'Enter the 6-digit interview code',
            placeHolder: '123456',
            password: true,
            validateInput: (text) => {
                if (!text) return 'Code is required';
                if (!/^\d{6}$/.test(text)) return 'Please enter a valid 6-digit code';
                return null;
            }
        });
        
        if (code) {
            const stored = context.globalState.get<{code: string, timestamp: number}>('interviewCode');
            
            if (!stored || stored.code !== code) {
                vscode.window.showErrorMessage('❌ Invalid code');
                return;
            }
            
            if (Date.now() - stored.timestamp > 2 * 60 * 60 * 1000) {
                vscode.window.showErrorMessage('❌ Code expired');
                return;
            }
            
            const startTime = new Date();
            activeSession = {
                sessionId: `INT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
                code: code,
                startTime: startTime,
                pasteAttempts: 0,
                focusLosses: 0,
                events: [],
                recording: {
                    keystrokes: [],
                    timeline: [],
                    fileSnapshots: []
                }
            };
            
            // Log session start
            if (activeSession && activeSession.recording) {
                activeSession.recording.timeline.push({
                    timestamp: startTime,
                    type: 'file-open',
                    details: 'Session started',
                    timeFromStart: 0
                });
            }
            
            takeSnapshot('auto');
            
            vscode.window.showInformationMessage('✅ Interview mode activated! All activity is being recorded.');
            
            // 👇 FIXED STATUS BAR CODE 👇
            // Dispose old status bar if exists
            if (statusBarItem) {
                statusBarItem.dispose();
            }
            
            // Create new status bar
            statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            statusBarItem.text = "$(record) REC ● Interview Mode";
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            statusBarItem.tooltip = "Session recording in progress";
            statusBarItem.show();
            
            // Start all tracking
            startKeystrokeRecording();
            startFocusMonitoring(context);
            startPauseDetection();
            startFileTracking();
        }
    });

    // End session command
    const endSessionCommand = vscode.commands.registerCommand('CodeMentor.endInterviewSession', async () => {
        if (!activeSession) {
            vscode.window.showErrorMessage('No active interview session');
            return;
        }
        
        takeSnapshot('session-end');
        activeSession.endTime = new Date();
        
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const code = editor.document.getText();
            activeSession.aiDetectionScore = await detectAIGenerated(code);
        }
        
        const stats = calculateSessionStats(activeSession);
        const report = generateEnhancedReport(activeSession, stats);
        showReportPanel(report);
        saveReportToFile(report);
        
        // 👇 CLEAN UP STATUS BAR 👇
        if (statusBarItem) {
            statusBarItem.dispose();
            statusBarItem = undefined;
        }
        
        activeSession = null;
        vscode.window.showInformationMessage('Interview session ended. Full recording saved.');
    });

    context.subscriptions.push(helloCommand, analyzeCommand, pasteDisposable, generateCodeCommand, enterCodeCommand, endSessionCommand);
}


function startKeystrokeRecording() {
    if (!activeSession) return;
    
    const startTime = activeSession.startTime.getTime();
    
    keystrokeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (!activeSession) return;
        
        const change = event.contentChanges[0];
        if (!change) return;
        
        const currentTime = new Date();
        const timeFromStart = currentTime.getTime() - startTime;
        
        // Record keystroke
        activeSession.recording.keystrokes.push({
            timestamp: currentTime,
            key: change.text,
            line: change.range.start.line,
            character: change.range.start.character,
            timeFromStart: timeFromStart
        });
        
        // Check for errors in real-time
        checkForErrors(event.document);
        
        // Auto-snapshot every 50 keystrokes
        if (activeSession.recording.keystrokes.length % 50 === 0) {
            takeSnapshot('auto');
        }
    });
}

function checkForErrors(document: vscode.TextDocument) {
    if (!activeSession) return;
    
    const text = document.getText();
    
    // Simple error detection
    if (text.includes('==') && !text.includes('===')) {
        activeSession.recording.timeline.push({
            timestamp: new Date(),
            type: 'error',
            details: 'Potential error: Using == instead of ===',
            timeFromStart: Date.now() - activeSession.startTime.getTime()
        });
    }
}


function startFileTracking() {
    if (!activeSession) return;
    
    const startTime = activeSession.startTime.getTime();
    
    // Track file opens
    const openDisposable = vscode.workspace.onDidOpenTextDocument((document) => {
        if (!activeSession) return;
        
        activeSession.recording.timeline.push({
            timestamp: new Date(),
            type: 'file-open',
            details: `Opened: ${document.fileName}`,
            timeFromStart: Date.now() - startTime
        });
    });
    
    // Track file closes
    const closeDisposable = vscode.workspace.onDidCloseTextDocument((document) => {
        if (!activeSession) return;
        
        activeSession.recording.timeline.push({
            timestamp: new Date(),
            type: 'file-close',
            details: `Closed: ${document.fileName}`,
            timeFromStart: Date.now() - startTime
        });
    });
}

function takeSnapshot(reason: 'auto' | 'manual' | 'session-end') {
    if (!activeSession) return;
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    activeSession.recording.fileSnapshots.push({
        timestamp: new Date(),
        content: editor.document.getText(),
        reason: reason,
        timeFromStart: Date.now() - activeSession.startTime.getTime()
    });
}


// ===========================================
// START PAUSE DETECTION (FIXED)
// ===========================================
function startPauseDetection() {
    if (!activeSession) return;
    
    const startTime = activeSession.startTime.getTime();
    lastKeystrokeTime = Date.now();
    
    // Clear any existing timeout
    if (pauseTimeout) {
        clearTimeout(pauseTimeout);
    }
    
    const resetTimer = () => {
        clearTimeout(pauseTimeout);
        
        const now = Date.now();
        const pauseDuration = now - lastKeystrokeTime;
        
        if (pauseDuration > 3000 && lastKeystrokeTime !== now) {
            if (activeSession && activeSession.recording) {
                activeSession.recording.timeline.push({
                    timestamp: new Date(lastKeystrokeTime + pauseDuration),
                    type: 'pause',
                    details: `Paused for ${Math.round(pauseDuration/1000)} seconds`,
                    timeFromStart: lastKeystrokeTime - startTime + pauseDuration
                });
            }
        }
        
        lastKeystrokeTime = now;
        
        pauseTimeout = setTimeout(resetTimer, 3000);
    };
    
    // Monitor keystrokes
    const pauseDisposable = vscode.workspace.onDidChangeTextDocument(() => {
        resetTimer();
    });
    
    // Start the timer
    resetTimer();
    
    // Add to subscriptions if needed (optional)
    // context.subscriptions.push(pauseDisposable);
}


// ===========================================
// FOCUS MONITORING FUNCTION
// ===========================================
// ===========================================
// ENHANCED FOCUS MONITORING - CATCHES ALL TAB SWITCHES
// ===========================================
function startFocusMonitoring(context: vscode.ExtensionContext) {
    if (!activeSession) return;
    
    focusLossCount = 0;
    console.log('👁️ Enhanced focus monitoring started');
    
    // Dispose existing if any
    if (focusDisposable) {
        focusDisposable.dispose();
    }
    
    // METHOD 1: Window focus change (Alt+Tab, clicking other windows)
    const windowFocusDisposable = vscode.window.onDidChangeWindowState((state) => {
        if (!activeSession) return;
        
        if (!state.focused) {
            handleFocusLoss('Window focus lost');
        }
    });
    
    // METHOD 2: Document visibility change (switching tabs in VS Code)
    const visibilityDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
        // This is just to keep the connection alive
    });
    
    // METHOD 3: Check active editor changes (switching between files)
    let lastActiveEditor = vscode.window.activeTextEditor;
    const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!activeSession) return;
        
        if (lastActiveEditor && editor && lastActiveEditor.document.fileName !== editor.document.fileName) {
            // User switched to different file
            handleFocusLoss(`Switched from ${lastActiveEditor.document.fileName} to ${editor.document.fileName}`);
        }
        lastActiveEditor = editor;
    });
    
    // METHOD 4: Check if VS Code is in background
    const interval = setInterval(() => {
        if (!activeSession) return;
        
        // This is a hack to detect if VS Code is not focused
        if (!vscode.window.state.focused) {
            handleFocusLoss('VS Code in background');
        }
    }, 1000);
    
    function handleFocusLoss(reason: string) {
        if (!activeSession) return;
        
        focusLossCount++;
        const currentTime = new Date();
        const timeFromStart = currentTime.getTime() - activeSession.startTime.getTime();
        
        console.log(`⚠️ Focus lost #${focusLossCount}: ${reason} at ${Math.round(timeFromStart/1000)}s`);
        
        // Add to events
        activeSession.events.push({
            type: 'focus-loss',
            timestamp: currentTime,
            details: `${reason} (${focusLossCount})`
        });
        
        // Add to timeline
        activeSession.recording.timeline.push({
            timestamp: currentTime,
            type: 'focus-loss',
            details: `${reason} (${focusLossCount})`,
            timeFromStart: timeFromStart
        });
        
        // Update focus count
        activeSession.focusLosses = focusLossCount;
        
        // Show warning with count
        if (focusLossCount === 1) {
            vscode.window.showWarningMessage(
                '⚠️ Warning: VS Code focus lost! Stay in the editor during interview!'
            );
        } else if (focusLossCount === 2) {
            vscode.window.showWarningMessage(
                '⚠️ Second focus loss detected! This affects your interview integrity.'
            );
        } else if (focusLossCount >= 3) {
            vscode.window.showErrorMessage(
                `🚨 CRITICAL: ${focusLossCount} focus losses detected! This will appear in your report.`
            );
            
            // Change status bar to red
            if (statusBarItem) {
                statusBarItem.text = "$(alert) VIOLATION: Tab Switched";
                statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            }
        }
    }
    
    // Store disposables
    context.subscriptions.push(
        windowFocusDisposable,
        visibilityDisposable,
        editorChangeDisposable
    );
    
    // Store interval for cleanup
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

// REAL AI ANALYSIS USING OLLAMA
async function realAIAnalysis(code: string, language: string): Promise<any[]> {
    try {
        console.log('🤖 Calling Ollama for AI analysis...');
        console.log('📝 Code being analyzed:', code.substring(0, 100) + '...'); // Show first 100 chars
        
        const response = await ollama.chat({
    model: 'llama3.2',
    messages: [{
        role: 'user',
        content: `You are a senior code reviewer. Analyze this ${language} code for QUALITY issues including:
        
        1. Code readability - Is it easy to understand?
        2. Best practices - Does it follow industry standards?
        3. Performance - Could it be faster?
        4. Maintainability - Will it be easy to modify?
        5. Naming conventions - Are variables/functions well-named?
        6. Code duplication - Is there repeated code?
        7. Complexity - Is it overly complex?
        
        Return a JSON array of quality suggestions. Each object must have:
        - line: number (approximate line number)
        - type: "readability" or "best-practice" or "performance" or "maintainability" or "naming" or "duplication" or "complexity"
        - message: short title of the quality issue
        - explanation: why this matters for code quality
        - improvement: how to make it better
        - concept: programming concept involved
        
        If code quality is good, return [{"type": "success", "message": "✅ Good quality code!", "explanation": "Your code follows good practices", "improvement": "", "concept": "quality"}]
        
        Code to analyze:
        ${code}
        
        Return ONLY the JSON array.`
    }]
});
        
        // Log the FULL response
        console.log('📨 Raw AI Response:', response);
        console.log('💬 AI Message Content:', response.message.content);
        
        // Parse the response
        const content = response.message.content;
        console.log('📄 Content to parse:', content);
        
        // Extract JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            console.log('🔍 Found JSON:', jsonMatch[0]);
            const errors = JSON.parse(jsonMatch[0]);
            console.log('✅ AI analysis complete:', errors);
            return errors;
        } else {
            console.log('❌ No JSON found in response');
        }
        
    } catch (error) {
        console.error('❌ Ollama error:', error);
    }
    
    // Fallback to simulated if AI fails
    console.log('⚠️ Falling back to simulated analysis');
    return simulateAnalysis(code, language);
}

// SIMULATED ANALYSIS FUNCTION (add this after activate() function)
function simulateAnalysis(code: string, language: string): any[] {
    const errors = [];
    
    // Check for common issues (simulated)
    if (language === 'javascript' || language === 'typescript') {
        if (code.includes('for i in') && !code.includes('for(let i in')) {
            errors.push({
                line: 1,
                type: 'syntax',
                message: 'Invalid loop syntax',
                explanation: 'In JavaScript, use "for(let i=0; i<arr.length; i++)" or "for(let i of arr)"',
                concept: 'loops',
                fix: 'for(let i = 0; i < arr.length; i++)'
            });
        }
        
        if (code.includes('==') && !code.includes('===')) {
            errors.push({
                line: 2,
                type: 'style',
                message: 'Use === instead of ==',
                explanation: '=== checks value AND type, == can cause unexpected bugs',
                concept: 'comparison',
                fix: '==='
            });
        }

        if (code.includes('var ')) {
            errors.push({
                line: 3,
                type: 'style',
                message: 'Use let or const instead of var',
                explanation: 'var has function scope, let and const have block scope and are safer',
                concept: 'variables',
                fix: 'let or const'
            });
        }
    }
    
    if (language === 'python') {
        // Fixed: properly handle the parentheses
        if (code.includes('for i in range(len') && code.includes('))')) {
            errors.push({
                line: 1,
                type: 'performance',
                message: 'Use direct iteration',
                explanation: 'Instead of "for i in range(len(arr))", use "for item in arr" directly',
                concept: 'loops',
                fix: 'for item in arr:'
            });
        }
        
        if (code.includes('print ') && !code.includes('print(')) {
            errors.push({
                line: 2,
                type: 'syntax',
                message: 'Use print() function',
                explanation: 'In Python 3, print is a function, use print() with parentheses',
                concept: 'functions',
                fix: 'print("text")'
            });
        }
    }
    
    // If no errors found, add a positive message
    if (errors.length === 0) {
        errors.push({
            line: 0,
            type: 'success',
            message: '✅ No errors found!',
            explanation: 'Your code looks good! Here are some tips to make it even better.',
            concept: 'improvement',
            fix: ''
        });
    }
    
    return errors;
}


function startSessionTracking() {
    if (!activeSession) return;
    
    // Track document changes
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
        if (!activeSession) return;
        
        activeSession.events.push({
            type: 'keystroke',
            timestamp: new Date(),
            lineNumber: event.document.lineAt(event.contentChanges[0]?.range.start.line).lineNumber,
            details: event.contentChanges[0]?.text
        });
    });
    
    // Track pauses (no typing for 5 seconds)
    let timeout: NodeJS.Timeout;
    const pauseDisposable = vscode.workspace.onDidChangeTextDocument(() => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (activeSession) {
                activeSession.events.push({
                    type: 'pause',
                    timestamp: new Date(),
                    details: 'Typing paused for 5+ seconds'
                });
            }
        }, 5000);
    });
}
async function detectAIGenerated(code: string): Promise<number> {
    try {
        const response = await ollama.chat({
            model: 'llama3.2',
            messages: [{
                role: 'user',
                content: `Analyze this code and return a probability score (0-100) that it was written by AI rather than a human. Consider:
                - Variable naming patterns (AI uses predictable names)
                - Comment style (AI comments are too perfect)
                - Code structure (AI follows patterns)
                - Error patterns (AI rarely makes mistakes)
                
                Return ONLY a number between 0-100.
                
                Code:
                ${code}`
            }]
        });
        
        const score = parseInt(response.message.content);
        return isNaN(score) ? 50 : score;
        
    } catch (error) {
        console.error('AI detection error:', error);
        return 50; // Default
    }
}

// ===========================================
// CALCULATE SESSION STATISTICS
// ===========================================
function calculateSessionStats(session: InterviewSession) {
    const startTime = session.startTime.getTime();
    const endTime = session.endTime ? session.endTime.getTime() : Date.now();
    const durationMs = endTime - startTime;
    const durationMinutes = Math.round(durationMs / 1000 / 60);
    
    // Keystroke stats
    const keystrokes = session.recording.keystrokes;
    const totalKeystrokes = keystrokes.length;
    const avgKeystrokesPerMinute = durationMinutes > 0 ? Math.round(totalKeystrokes / durationMinutes) : 0;
    
    // Typing speed variations
    let typingSpeed: number[] = [];
    if (keystrokes.length > 0) {
        const windowSize = 50; // keystrokes per window
        for (let i = 0; i < keystrokes.length; i += windowSize) {
            const window = keystrokes.slice(i, i + windowSize);
            if (window.length > 1) {
                const timeDiff = window[window.length - 1].timeFromStart - window[0].timeFromStart;
                const speed = timeDiff > 0 ? Math.round((window.length / timeDiff) * 60000) : 0;
                typingSpeed.push(speed);
            }
        }
    }
    
    // Timeline stats
    const timeline = session.recording.timeline;
    const filesOpened = timeline.filter(t => t.type === 'file-open').length;
    const errors = timeline.filter(t => t.type === 'error').length;
    const pauses = timeline.filter(t => t.type === 'pause').length;
    const snapshots = session.recording.fileSnapshots.length;
    
    return {
        durationMinutes,
        totalKeystrokes,
        avgKeystrokesPerMinute,
        typingSpeed,
        filesOpened,
        errors,
        pauses,
        snapshots
    };
}

function generateEnhancedReport(session: InterviewSession, stats: any) {
    return {
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        durationMinutes: stats.durationMinutes,
        
        integrity: {
            pasteAttempts: session.pasteAttempts,
            focusLosses: session.focusLosses,
            aiProbability: session.aiDetectionScore || 50
        },
        
        typing: {
            totalKeystrokes: stats.totalKeystrokes,
            avgKeystrokesPerMinute: stats.avgKeystrokesPerMinute,
            typingSpeed: stats.typingSpeed,
            pauses: stats.pauses
        },
        
        activity: {
            filesOpened: stats.filesOpened,
            errorsDetected: stats.errors,
            snapshots: stats.snapshots
        },
        
        timeline: session.recording.timeline.map(t => ({
            time: new Date(t.timeFromStart).toISOString().substr(14, 5), // MM:SS format
            type: t.type,
            details: t.details
        })),
        
        codeEvolution: session.recording.fileSnapshots.map(s => ({
            time: new Date(s.timeFromStart).toISOString().substr(14, 5),
            content: s.content.length > 100 ? s.content.substring(0, 100) + '...' : s.content,
            reason: s.reason
        })),
        
        verdict: session.pasteAttempts > 0 ? "⚠️ Paste attempts detected" :
                 (session.aiDetectionScore || 0) > 70 ? "🔴 High AI probability" :
                 session.focusLosses > 3 ? "⚠️ Multiple tab switches" :
                 "✅ Genuine candidate"
    };
}

// SIMULATED ANALYSIS FUNCTION (for demo)
function showResultsPanel(context: vscode.ExtensionContext, errors: any[], fileName: string, language: string) {
    const panel = vscode.window.createWebviewPanel(
        'codementorResults',
        'CodeMentor Quality Report',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    // Generate HTML for results
    let errorsHtml = '';
    errors.forEach((err, index) => {
        const color = err.type === 'success' ? '#a3a3a3' : 
                     err.type === 'syntax' ? '#F44336' : 
                     err.type === 'performance' ? '#FF9800' : '#2196F3';
        
        errorsHtml += `
        <div style="border-left: 5px solid ${color}; padding: 15px; margin-bottom: 15px; background: #2D2D2D; border-radius: 5px; border: 1px solid #404040;">
            <h3 style="color: ${color}; margin-top: 0; margin-bottom: 10px;">${err.message}</h3>
            <p style="color: #E0E0E0; margin: 5px 0;"><strong style="color: #CCCCCC;">Line:</strong> ${err.line}</p>
            <p style="color: #E0E0E0; margin: 5px 0;"><strong style="color: #CCCCCC;">${err.type === 'success' ? 'Tip' : 'Explanation'}:</strong> ${err.explanation}</p>
            ${err.concept !== 'improvement' ? `<p style="color: #E0E0E0; margin: 5px 0;"><strong style="color: #CCCCCC;">Concept:</strong> ${err.concept}</p>` : ''}
            ${err.fix ? `<p style="color: #E0E0E0; margin: 5px 0;"><strong style="color: #CCCCCC;">Suggestion:</strong> <code style="background: #1E1E1E; color: #D4D4D4; padding: 3px 6px; border-radius: 3px; font-family: monospace;">${err.fix}</code></p>` : ''}
            ${err.type !== 'success' ? `<button onclick="learnMore('${err.concept}')" style="background: #007ACC; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px; font-size: 13px;">📘 Learn More About ${err.concept}</button>` : ''}
        </div>
        `;
    });

    panel.webview.html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                padding: 20px; 
                background-color: #1E1E1E;
                color: #E0E0E0;
                line-height: 1.5;
            }
            h1 { 
                color: #007ACC; 
                border-bottom: 2px solid #007ACC;
                padding-bottom: 10px;
                margin-top: 0;
            }
            h2 {
                color: #FFFFFF;
                margin-top: 0;
            }
            h3 {
                color: #FFFFFF;
                margin: 10px 0;
            }
            .summary { 
                background: #2D2D2D; 
                padding: 20px; 
                border-radius: 8px; 
                margin-bottom: 20px;
                border: 1px solid #404040;
            }
            .summary h2 {
                color: #FFFFFF;
                margin-top: 0;
            }
            .summary p {
                color: #CCCCCC;
                margin: 5px 0;
            }
            .stats { 
                display: flex; 
                gap: 20px; 
                margin-bottom: 25px; 
            }
            .stat-box { 
                background: #2D2D2D; 
                padding: 20px; 
                border-radius: 8px; 
                flex: 1; 
                text-align: center;
                border: 1px solid #404040;
            }
            .stat-box div:first-child { 
                font-size: 36px; 
                font-weight: bold; 
                color: #007ACC; 
                margin-bottom: 5px;
            }
            .stat-box div:last-child { 
                color: #CCCCCC; 
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .concepts-list {
                background: #2D2D2D;
                padding: 15px;
                border-radius: 8px;
                border: 1px solid #404040;
                margin-bottom: 25px;
            }
            .concept-tag { 
                background: #404040; 
                color: #FFFFFF;
                padding: 6px 12px; 
                border-radius: 20px; 
                display: inline-block; 
                margin: 4px;
                font-size: 13px;
                border: 1px solid #555;
            }
            .progress-section {
                background: #2D2D2D;
                padding: 20px;
                border-radius: 8px;
                margin-top: 25px;
                border: 1px solid #404040;
            }
            .progress-bar {
                background: #404040;
                height: 12px;
                border-radius: 6px;
                margin: 15px 0;
                overflow: hidden;
            }
            .progress-fill {
                background: #4CAF50;
                height: 100%;
                width: ${Math.min(100, errors.filter(e => e.concept !== 'improvement').length * 20)}%;
                border-radius: 6px;
                transition: width 0.3s ease;
            }
            .footer {
                color: #888888;
                margin-top: 30px;
                font-size: 12px;
                text-align: center;
                border-top: 1px solid #404040;
                padding-top: 15px;
            }
            code {
                background: #1E1E1E;
                color: #D4D4D4;
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 13px;
                border: 1px solid #404040;
            }
            button {
                transition: background-color 0.2s;
            }
            button:hover {
                background-color: #005A9E !important;
            }
        </style>
        <script>
            const vscode = acquireVsCodeApi();
            function learnMore(concept) {
                vscode.postMessage({ command: 'learnMore', concept: concept });
            }
        </script>
    </head>
    <body>
        <h1>🔍 CodeMentor Analysis</h1>
        
        <div class="summary">
            <h2>📄 ${path.basename(fileName)}</h2>
            <p>Language: ${language}</p>
            <p>Analysis Time: ${new Date().toLocaleTimeString()}</p>
        </div>
        
        <div class="stats">
            <div class="stat-box">
                <div>${errors.filter(e => e.type !== 'success').length}</div>
                <div>Issues Found</div>
            </div>
            <div class="stat-box">
                <div>${errors.filter(e => e.type === 'success').length > 0 ? '✨' : '📚'}</div>
                <div>${errors.filter(e => e.type === 'success').length > 0 ? 'All Good!' : 'Learning Opportunities'}</div>
            </div>
        </div>
        
        ${errors.filter(e => e.concept !== 'improvement').length > 0 ? `
        <div class="concepts-list">
            <h3 style="margin-top: 0; color: #FFFFFF;">🎯 Concepts to Review</h3>
            ${[...new Set(errors.map(e => e.concept))].filter(c => c !== 'improvement').map(c => 
                `<span class="concept-tag">${c}</span>`
            ).join('')}
        </div>
        ` : ''}
        
        <h2 style="color: #FFFFFF; margin-bottom: 15px;">📋 Detailed Results</h2>
        ${errorsHtml}
        
        <div class="progress-section">
            <h3 style="margin-top: 0; color: #FFFFFF;">📊 Your Learning Progress</h3>
            <p style="color: #CCCCCC;">You've practiced <strong style="color: #4CAF50;">${errors.filter(e => e.concept !== 'improvement').length}</strong> concepts today</p>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <p style="color: #4CAF50; font-weight: bold; text-align: center; font-size: 16px;">Keep coding! 🚀</p>
        </div>
        
        <div class="footer">
            ⚡ All analysis runs locally on your machine • 100% Private • Free Forever
        </div>
    </body>
    </html>
    `;
}

// ===========================================
// SHOW REPORT PANEL (WITHOUT PRINT BUTTON)
// ===========================================
function showReportPanel(report: any) {
    const panel = vscode.window.createWebviewPanel(
        'interviewReport',
        '📊 CodeMentor Interview Report',
        vscode.ViewColumn.Beside,
        { 
            enableScripts: true,
            localResourceRoots: [] 
        }
    );
    
    // Handle messages from webview
   // Handle messages from webview
panel.webview.onDidReceiveMessage(
    async (message) => {
        if (message.command === 'exportPDF') {
            const homedir = require('os').homedir();
            const reportsDir = path.join(homedir, 'CodeMentor-Reports');
            const fs = require('fs');
            
            // Create folder if it doesn't exist
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }
            
            // Find the latest report file
            const files = fs.readdirSync(reportsDir);
            const reportFiles = files.filter((f: string) => f.endsWith('.json'));
            
            if (reportFiles.length > 0) {
                // Sort by date (newest first)
                reportFiles.sort().reverse();
                const latestReport = reportFiles[0];
                const filePath = path.join(reportsDir, latestReport);
                
                // Open the folder and highlight the file
                const uri = vscode.Uri.file(filePath);
                vscode.commands.executeCommand('revealFileInOS', uri);
                
                vscode.window.showInformationMessage(`📁 Report: ${latestReport}`);
            } else {
                // Just open folder if no reports
                const uri = vscode.Uri.file(reportsDir);
                vscode.commands.executeCommand('revealFileInOS', uri);
                vscode.window.showInformationMessage('📁 Reports folder opened');
            }
        }
    },
    undefined,
    []
);
    // Safely access nested properties
    const sessionId = report.sessionId || 'N/A';
    const startTime = report.startTime ? new Date(report.startTime).toLocaleString() : 'N/A';
    const duration = report.durationMinutes || 0;
    
    // Integrity metrics
    const pasteAttempts = report.integrity?.pasteAttempts || 0;
    const focusLosses = report.integrity?.focusLosses || 0;
    const aiProbability = report.integrity?.aiProbability || 0;
    
    // Typing metrics
    const totalKeystrokes = report.typing?.totalKeystrokes || 0;
    const avgKeystrokes = report.typing?.avgKeystrokesPerMinute || 0;
    const pauses = report.typing?.pauses || 0;
    
    // Activity metrics
    const filesOpened = report.activity?.filesOpened || 0;
    const errorsDetected = report.activity?.errorsDetected || 0;
    const snapshots = report.activity?.snapshots || 0;
    
    // Verdict
    const verdict = report.verdict || "Report generated";
    const verdictColor = verdict.includes('Genuine') ? '#4CAF50' : 
                         verdict.includes('High AI') ? '#f44336' : 
                         verdict.includes('Paste') ? '#ff9800' : 
                         verdict.includes('tab') ? '#ff9800' : '#2196F3';
    
    // Calculate integrity score
    const integrityScore = Math.max(0, Math.min(100, 
        100 - (pasteAttempts * 15) - (focusLosses * 10) - (aiProbability * 0.3)
    ));
    
    // Generate timeline HTML if available
    let timelineHtml = '';
    if (report.timeline && report.timeline.length > 0) {
        timelineHtml = report.timeline.map((event: any) => {
            const icon = event.type === 'file-open' ? '📂' :
                        event.type === 'file-close' ? '📕' :
                        event.type === 'focus-loss' ? '👁️' :
                        event.type === 'error' ? '❌' :
                        event.type === 'pause' ? '⏸️' : '📝';
            
            const color = event.type === 'error' ? '#f44336' :
                         event.type === 'focus-loss' ? '#ff9800' :
                         event.type === 'pause' ? '#2196F3' : '#4CAF50';
            
            return `
                <div style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #404040; color: white;">
                    <span style="width: 60px; color: #888;">${event.time || '00:00'}</span>
                    <span style="width: 40px; color: ${color};">${icon}</span>
                    <span style="flex: 1; color: #ddd;">${event.details || ''}</span>
                </div>
            `;
        }).join('');
    } else {
        timelineHtml = '<div style="color: #888; padding: 20px; text-align: center;">No timeline data available</div>';
    }
    
    // Generate typing speed graph
    let typingGraphHtml = '';
    if (report.typing?.typingSpeed && report.typing.typingSpeed.length > 0) {
        const maxSpeed = Math.max(...report.typing.typingSpeed, 1);
        typingGraphHtml = report.typing.typingSpeed.map((speed: number) => {
            const height = Math.max(4, (speed / maxSpeed) * 60);
            return `<div style="flex: 1; height: 60px; display: flex; align-items: flex-end; justify-content: center;">
                <div style="width: 80%; background: #4CAF50; height: ${height}px; border-radius: 3px 3px 0 0;" title="${speed} keystrokes"></div>
            </div>`;
        }).join('');
    }
    
    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                    background: #1e1e1e;
                    padding: 30px 20px;
                }
                .report-container {
                    max-width: 1000px;
                    margin: 0 auto;
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 15px 15px 0 0;
                    padding: 25px;
                    color: white;
                }
                .header h1 {
                    font-size: 28px;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .header .session-id {
                    background: rgba(255,255,255,0.2);
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 14px;
                    display: inline-block;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 15px;
                    margin: 20px 0;
                }
                .stat-card {
                    background: #2d2d2d;
                    border-radius: 12px;
                    padding: 20px;
                    border: 1px solid #404040;
                }
                .stat-icon {
                    font-size: 24px;
                    margin-bottom: 10px;
                }
                .stat-label {
                    color: #888;
                    font-size: 12px;
                    text-transform: uppercase;
                    margin-bottom: 5px;
                }
                .stat-value {
                    font-size: 28px;
                    font-weight: bold;
                    color: white;
                }
                .stat-unit {
                    font-size: 14px;
                    color: #666;
                    margin-left: 5px;
                }
                .section {
                    background: #2d2d2d;
                    border-radius: 12px;
                    padding: 20px;
                    margin: 20px 0;
                    border: 1px solid #404040;
                }
                .section h2 {
                    color: white;
                    margin-bottom: 15px;
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .integrity-meter {
                    background: #1e1e1e;
                    border-radius: 8px;
                    padding: 15px;
                }
                .meter-bar {
                    height: 20px;
                    background: #404040;
                    border-radius: 10px;
                    overflow: hidden;
                    margin: 10px 0;
                }
                .meter-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #4CAF50, #8BC34A);
                    border-radius: 10px;
                    width: ${integrityScore}%;
                    transition: width 0.5s;
                }
                .verdict-box {
                    background: ${verdictColor};
                    border-radius: 12px;
                    padding: 25px;
                    margin: 20px 0;
                    color: white;
                    text-align: center;
                }
                .verdict-box h2 {
                    font-size: 24px;
                    margin-bottom: 10px;
                }
                .timeline-container {
                    max-height: 300px;
                    overflow-y: auto;
                    background: #1e1e1e;
                    border-radius: 8px;
                    padding: 10px;
                }
                .typing-graph {
                    display: flex;
                    align-items: flex-end;
                    height: 70px;
                    gap: 2px;
                    margin: 20px 0;
                    background: #1e1e1e;
                    padding: 10px;
                    border-radius: 8px;
                }
                .btn {
                    background: #007acc;
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 25px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: all 0.3s;
                    margin: 10px;
                }
                .btn:hover {
                    background: #005a9e;
                    transform: translateY(-2px);
                    box-shadow: 0 5px 15px rgba(0,122,204,0.4);
                }
                .btn-container {
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    margin: 30px 0;
                }
                .footer {
                    color: #666;
                    text-align: center;
                    font-size: 12px;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #404040;
                }
            </style>
        </head>
        <body>
            <div class="report-container">
                <!-- Header -->
                <div class="header">
                    <h1>
                        📋 CodeMentor Interview Report
                    </h1>
                    <div class="session-id">
                        Session: ${sessionId} • ${new Date().toLocaleDateString()}
                    </div>
                </div>
                
                <!-- Quick Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">⏱️</div>
                        <div class="stat-label">Duration</div>
                        <div class="stat-value">${duration}<span class="stat-unit">min</span></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⌨️</div>
                        <div class="stat-label">Keystrokes</div>
                        <div class="stat-value">${totalKeystrokes}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⏸️</div>
                        <div class="stat-label">Pauses</div>
                        <div class="stat-value">${pauses}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📊</div>
                        <div class="stat-label">Integrity</div>
                        <div class="stat-value">${Math.round(integrityScore)}<span class="stat-unit">%</span></div>
                    </div>
                </div>
                
                <!-- Integrity Section -->
                <div class="section">
                    <h2>🛡️ Integrity Metrics</h2>
                    <div class="integrity-meter">
                        <div style="display: flex; justify-content: space-between; color: white; margin-bottom: 5px;">
                            <span>🚫 Paste Attempts: ${pasteAttempts}</span>
                            <span>👁️ Focus Losses: ${focusLosses}</span>
                            <span>🤖 AI Probability: ${aiProbability}%</span>
                        </div>
                        <div class="meter-bar">
                            <div class="meter-fill"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Typing Analysis -->
                <div class="section">
                    <h2>⌨️ Typing Analysis</h2>
                    <div style="display: flex; justify-content: space-between; color: white; margin-bottom: 15px;">
                        <span>Average Speed: ${avgKeystrokes} keys/min</span>
                        <span>Files Opened: ${filesOpened}</span>
                        <span>Errors: ${errorsDetected}</span>
                    </div>
                    ${typingGraphHtml ? `
                        <div class="typing-graph">
                            ${typingGraphHtml}
                        </div>
                    ` : ''}
                </div>
                
                <!-- Timeline -->
                <div class="section">
                    <h2>📋 Activity Timeline</h2>
                    <div class="timeline-container">
                        ${timelineHtml}
                    </div>
                </div>
                
                <!-- Verdict -->
                <div class="verdict-box">
                    <h2>${verdict}</h2>
                    <p>Based on analysis of ${totalKeystrokes} keystrokes over ${duration} minutes</p>
                </div>
                
                <!-- Single Export Button -->
                <div class="btn-container">
                    <button class="btn" onclick="exportReport()">
                        📥 Export Report (JSON)
                    </button>
                </div>
                
                <div class="footer">
                    ⚡ Generated by CodeMentor • All data stored locally • ${new Date().toLocaleString()}
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function exportReport() {
                    vscode.postMessage({ command: 'exportPDF' });
                }
            </script>
        </body>
        </html>
    `;
}

// ===========================================
// SAVE REPORT TO FILE FUNCTION
// ===========================================
function saveReportToFile(report: any) {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Create reports folder in user's home directory (safer location)
        const homedir = require('os').homedir();
        const reportsDir = path.join(homedir, 'CodeMentor-Reports');
        
        // Create folder if it doesn't exist
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        // Generate filename with timestamp
        const date = new Date();
        const timestamp = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}_${date.getHours().toString().padStart(2,'0')}-${date.getMinutes().toString().padStart(2,'0')}`;
        const filename = `interview-report-${timestamp}.json`;
        const filePath = path.join(reportsDir, filename);
        
        // Save report as JSON with nice formatting
        fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        
        // Show success message with option to open folder
        vscode.window.showInformationMessage(`✅ Report saved: ${filename}`, 'Open Folder').then(selection => {
            if (selection === 'Open Folder') {
                // Open the reports folder
                const uri = vscode.Uri.file(reportsDir);
                vscode.commands.executeCommand('revealFileInOS', uri);
            }
        });
        
        console.log(`✅ Report saved to: ${filePath}`);
        
    } catch (error) {
        console.error('❌ Error saving report:', error);
        vscode.window.showErrorMessage('Failed to save report file');
    }
}

export function deactivate() {
    // Clean up status bar
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    
    // Clean up other disposables
    if (pauseTimeout) {
        clearTimeout(pauseTimeout);
    }
    
    if (focusDisposable) {
        focusDisposable.dispose();
    }
    
    if (keystrokeDisposable) {
        keystrokeDisposable.dispose();
    }
}