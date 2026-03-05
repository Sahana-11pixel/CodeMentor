import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ollama from 'ollama';


// Interview state management
interface InterviewSession {
    sessionId: string;
    code: string;
    startTime: Date;
    endTime?: Date;
    interviewerId?: string;
    candidateName?: string;
    pasteAttempts: number;
    events: SessionEvent[];
    aiDetectionScore?: number;
}

interface SessionEvent {
    type: 'keystroke' | 'paste' | 'error' | 'pause';
    timestamp: Date;
    lineNumber?: number;
    details?: string;
}

let activeSession: InterviewSession | null = null;
let pasteAttempts = 0;
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

    context.subscriptions.push(helloCommand, analyzeCommand);
}

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
    const context = vscode.extensions.getExtension('CodeMentor')?.exports;
    // Save code with timestamp (valid for 2 hours)
    
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
    // await context.globalState.update('interviewCode', {code: interviewCode, timestamp: Date.now()});
});

// Enter interview code command
const enterCodeCommand = vscode.commands.registerCommand('CodeMentor.enterInterviewCode', async () => {
    const code = await vscode.window.showInputBox({
        prompt: 'Enter the 6-digit interview code',
        placeHolder: '123456',
        validateInput: (text) => {
            return text && /^\d{6}$/.test(text) ? null : 'Please enter a valid 6-digit code';
        }
    });
    
    if (code) {
        // Validate code (check against stored in global state)
        // const stored = await context.globalState.get('interviewCode');
        
        // For demo, accept any 6-digit code
        vscode.window.showInformationMessage('✅ Interview mode activated! Pasting is now disabled.');
        
        // Create new session
        activeSession = {
            sessionId: Date.now().toString(),
            code: code,
            startTime: new Date(),
            pasteAttempts: 0,
            events: []
        };
        
        // Show status bar item
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = "$(shield) Interview Mode Active";
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.show();
        
        // Start tracking
        startSessionTracking();
    }else {
                vscode.window.showErrorMessage('❌ Invalid or expired interview code');
            }
});

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

function generateReport(session: InterviewSession): any {
    // Calculate metrics
    const totalKeystrokes = session.events.filter(e => e.type === 'keystroke').length;
    const pauses = session.events.filter(e => e.type === 'pause').length;
    const duration = (session.endTime!.getTime() - session.startTime.getTime()) / 1000 / 60; // minutes
    
    return {
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        durationMinutes: Math.round(duration),
        pasteAttempts: session.pasteAttempts,
        aiProbability: session.aiDetectionScore || 50,
        totalKeystrokes,
        pauses,
        events: session.events,
        verdict: session.pasteAttempts > 0 ? "⚠️ Paste attempts detected" :
                 (session.aiDetectionScore || 0) > 70 ? "🔴 High AI probability" :
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



function showReportPanel(report: any) {
    const panel = vscode.window.createWebviewPanel(
        'interviewReport',
        '📊 Interview Session Report',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );
    
    // Calculate visual indicators
    const aiBarWidth = Math.min(report.aiProbability, 100);
    const aiBarColor = report.aiProbability > 70 ? '#f44336' : 
                       report.aiProbability > 40 ? '#ff9800' : '#4CAF50';
    
    const pasteBarWidth = Math.min(report.pasteAttempts * 33, 100);
    
    // Verdict with emoji
    let verdictEmoji = report.verdict.includes('Genuine') ? '✅' : 
                       report.verdict.includes('High AI') ? '🤖⚠️' : '⚠️';
    
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
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 30px 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .report-card {
                    max-width: 800px;
                    width: 100%;
                    background: white;
                    border-radius: 20px;
                    padding: 30px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    animation: slideIn 0.5s ease-out;
                }
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #f0f0f0;
                }
                .header-icon {
                    font-size: 48px;
                    margin-right: 20px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                }
                .header-title h1 {
                    color: #333;
                    font-size: 28px;
                    margin-bottom: 5px;
                }
                .header-title p {
                    color: #666;
                    font-size: 14px;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .stat-card {
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 20px;
                    text-align: center;
                    transition: transform 0.3s;
                    border: 1px solid #e0e0e0;
                }
                .stat-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                }
                .stat-icon {
                    font-size: 32px;
                    margin-bottom: 10px;
                }
                .stat-value {
                    font-size: 32px;
                    font-weight: bold;
                    color: #333;
                    margin-bottom: 5px;
                }
                .stat-label {
                    color: #666;
                    font-size: 14px;
                }
                .progress-section {
                    background: #f8f9fa;
                    border-radius: 15px;
                    padding: 25px;
                    margin-bottom: 30px;
                    border: 1px solid #e0e0e0;
                }
                .progress-item {
                    margin-bottom: 20px;
                }
                .progress-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    color: #555;
                    font-weight: 500;
                }
                .progress-bar-bg {
                    width: 100%;
                    height: 12px;
                    background: #e0e0e0;
                    border-radius: 6px;
                    overflow: hidden;
                }
                .progress-bar-fill {
                    height: 100%;
                    border-radius: 6px;
                    transition: width 1s ease-in-out;
                    animation: fillBar 1.5s ease-out;
                }
                @keyframes fillBar {
                    from { width: 0; }
                    to { width: ${aiBarWidth}%; }
                }
                .verdict-box {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 15px;
                    padding: 25px;
                    margin-bottom: 25px;
                    color: white;
                    text-align: center;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                }
                .verdict-box h2 {
                    font-size: 28px;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                }
                .verdict-box p {
                    font-size: 16px;
                    opacity: 0.9;
                }
                .details-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    margin-bottom: 25px;
                }
                .detail-item {
                    background: #f8f9fa;
                    border-radius: 10px;
                    padding: 15px;
                    border: 1px solid #e0e0e0;
                }
                .detail-label {
                    color: #666;
                    font-size: 13px;
                    margin-bottom: 5px;
                }
                .detail-value {
                    color: #333;
                    font-size: 18px;
                    font-weight: 600;
                }
                .actions {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                }
                .btn {
                    padding: 12px 30px;
                    border: none;
                    border-radius: 25px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }
                .btn-primary {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
                }
                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
                }
                .btn-secondary {
                    background: white;
                    color: #667eea;
                    border: 2px solid #667eea;
                }
                .btn-secondary:hover {
                    background: #f0f0f0;
                    transform: translateY(-2px);
                }
                .timestamp {
                    text-align: center;
                    color: #999;
                    font-size: 12px;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="report-card">
                <div class="header">
                    <div class="header-icon">📋</div>
                    <div class="header-title">
                        <h1>Interview Session Report</h1>
                        <p>Session ID: ${report.sessionId}</p>
                    </div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">⏱️</div>
                        <div class="stat-value">${report.durationMinutes}</div>
                        <div class="stat-label">Minutes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⌨️</div>
                        <div class="stat-value">${report.totalKeystrokes}</div>
                        <div class="stat-label">Keystrokes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⏸️</div>
                        <div class="stat-value">${report.pauses}</div>
                        <div class="stat-label">Pauses</div>
                    </div>
                </div>
                
                <div class="progress-section">
                    <div class="progress-item">
                        <div class="progress-header">
                            <span>🤖 AI Probability</span>
                            <span>${report.aiProbability}%</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${report.aiProbability}%; background: ${aiBarColor};"></div>
                        </div>
                    </div>
                    
                    <div class="progress-item">
                        <div class="progress-header">
                            <span>🚫 Paste Attempts</span>
                            <span>${report.pasteAttempts}</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${Math.min(report.pasteAttempts * 33, 100)}%; background: #ff9800;"></div>
                        </div>
                    </div>
                </div>
                
                <div class="verdict-box">
                    <h2>${verdictEmoji} ${report.verdict}</h2>
                    <p>Based on analysis of ${report.totalKeystrokes} keystrokes over ${report.durationMinutes} minutes</p>
                </div>
                
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">Start Time</div>
                        <div class="detail-value">${new Date(report.startTime).toLocaleTimeString()}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">End Time</div>
                        <div class="detail-value">${new Date(report.endTime).toLocaleTimeString()}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Date</div>
                        <div class="detail-value">${new Date(report.startTime).toLocaleDateString()}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">AI Confidence</div>
                        <div class="detail-value">${Math.abs(report.aiProbability - 50) * 2}%</div>
                    </div>
                </div>
                
                <div class="actions">
                    <button class="btn btn-primary" onclick="exportPDF()">
                        📥 Export PDF
                    </button>
                    <button class="btn btn-secondary" onclick="printReport()">
                        🖨️ Print
                    </button>
                </div>
                
                <div class="timestamp">
                    Generated by CodeMentor • ${new Date().toLocaleString()}
                </div>
            </div>
            
            <script>
                function exportPDF() {
                    vscode.postMessage({ command: 'exportPDF' });
                }
                function printReport() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `;
}

const endSessionCommand = vscode.commands.registerCommand('CodeMentor.endInterviewSession', async () => {
    if (!activeSession) {
        vscode.window.showErrorMessage('No active interview session');
        return;
    }
    
    // End session
    activeSession.endTime = new Date();
    
    // Get current code for AI analysis
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const code = editor.document.getText();
        activeSession.aiDetectionScore = await detectAIGenerated(code);
    }
    
    // Generate report
    const report = generateReport(activeSession);
    
    // Show report
    showReportPanel(report);
    
    // Save report to file
    saveReportToFile(report);
    
    // Clear session
    activeSession = null;
    vscode.window.showInformationMessage('Interview session ended. Report generated.');
});



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

export function deactivate() {}