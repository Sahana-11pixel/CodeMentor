## ✅ **Here's the Complete README in Simple English**

---

# Code-Mentor - AI Coding Tutor for VS Code

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://marketplace.visualstudio.com/items?itemName=YOUR_PUBLISHER_ID.CodeMentor)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 🤔 What is Code-Mentor?

Code-Mentor is a VS Code extension that helps you write better code. It's like having a friendly teacher sitting next to you who explains your mistakes in simple words.

**Two main things it does:**
1. **For learners** – Analyzes your code and explains errors in plain English
2. **For interviewers** – Stops cheating during coding interviews

---

## ✨ **Features (Simple Explanation)**

### 🔍 **Code Analysis**
- Click one button to check your code quality
- Finds mistakes, slow code, and bad writing style
- **Explains errors in simple English** – no technical jargon
- Suggests fixes you can apply with one click

### 🛡️ **Interview Mode (Stop Cheating)**
- **Paste Shield** – Stops candidates from copying-pasting code
- **AI Detection** – Tells if code was written by AI (ChatGPT)
- **Focus Monitor** – Knows if candidate switches tabs
- **Session Recording** – Keeps track of everything typed
- **Candidate Report** – Gives a clear report with scores

### 📊 **Progress Dashboard**
- See your code quality score
- View your typing speed and pauses
- Track which topics you're good at (loops, functions, etc.)
- Clean, dark-themed reports

---

## 🔒 **Privacy – Your Code Stays Yours**

- ✅ **100% local** – Everything runs on your computer
- ✅ **No internet needed** – Works offline
- ✅ **Free forever** – No hidden costs
- ✅ **Your code never leaves your machine** – Complete privacy

---

## 📋 **What You Need Before Installing**

### **1. VS Code**
- Version 1.109.0 or higher

### **2. Ollama (Required for AI)**
CodeMentor uses Ollama to run AI on your computer. You need to install it first.

#### **How to Install Ollama:**

**Windows:**
```bash
# Way 1: Download from website
Go to https://ollama.com/download/windows
Click download and install

# Way 2: Use command (if you know how)
winget install Ollama.Ollama
```

**Mac:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

#### **After Installing Ollama:**

Open terminal and run:
```bash
ollama pull llama3.2
```

This downloads the AI model (about 2GB). It takes 5-10 minutes depending on your internet.

#### **Check if Ollama is working:**
```bash
ollama run llama3.2 "Hello"
```

---

## 🚀 **How to Install CodeMentor**

### **Method 1: Install from VSIX file (Easy)**

1. Download the `CodeMentor-1.0.0.vsix` file here -> https://drive.google.com/file/d/1JamniMK9EQjOjR9lAKhlcVtw6KssCral/view?usp=sharing
2. Open VS Code 
3. Press `Ctrl+Shift+P` to open command palette
4. Type: `Extensions: Install from VSIX`
5. Select the downloaded file
6. Click Install
7. Restart VS Code

### **Method 2: Install from VS Code Marketplace (Coming Soon)**

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "Code-Mentor"
4. Click Install

---

## 🎯 **How to Use CodeMentor**

### **For Students (Code Analysis)**

1. Open any `.js`, `.ts`, or `.py` file
2. Press `Ctrl+Shift+P` to open command palette
3. Type: `CodeMentor: Analyze Code`
4. Wait 3-5 seconds
5. Results panel opens with:
   - What's wrong (in simple words)
   - Which line has the error
   - How to fix it
   - "Fix" button to auto-correct

### **For Interviewers (Interview Mode)**

**Step 1: Generate code for candidate**
- Press `Ctrl+Shift+P`
- Type: `CodeMentor: Generate Interview Code`
- A 6-digit code appears (example: `739241`)
- Share this code with your candidate

**Step 2: Candidate enters code**
- Candidate presses `Ctrl+Shift+P`
- Types: `CodeMentor: Enter Interview Code`
- Enters the 6-digit code
- Interview mode starts:
  - ✅ Can't copy-paste
  - ✅ Tab switching gets tracked
  - ✅ Everything typed is recorded

**Step 3: End session and get report**
- Press `Ctrl+Shift+P`
- Type: `CodeMentor: End Interview Session`
- A detailed report shows:
  - How many times they tried to paste
  - How many times they switched tabs
  - If code looks AI-generated
  - Final verdict: Genuine or Suspicious

---

## 📸 **What You'll See**

### **Code Analysis Result:**
```
┌─────────────────────────────────────┐
│  🔍 Code Analysis                    │
├─────────────────────────────────────┤
│  Found 2 issues:                     │
│                                      │
│  1. Loop is wrong                     │
│     Line: 3                          │
│     Fix: Use for(let i=0; i<5; i++)  │
│     [Click to Fix]                    │
│                                      │
│  2. Use === instead of ==             │
│     Line: 5                          │
│     [Click to Fix]                    │
└─────────────────────────────────────┘
```

### **Interview Report:**
```
┌─────────────────────────────────────┐
│  📊 Interview Report                 │
├─────────────────────────────────────┤
│  Duration: 45 minutes                │
│  Paste attempts: 0                   │
│  Tab switches: 1                     │
│  AI chance: 23%                      │
│                                      │
│  ✅ Genuine Candidate                 │
└─────────────────────────────────────┘
```

---

## ❓ **Troubleshooting (If Something Goes Wrong)**

| Problem | Solution |
|---------|----------|
| **"Ollama not found" error** | Make sure Ollama is installed. Open terminal and type: `ollama serve` |
| **First analysis is slow** | First time takes 10 seconds to load AI model. Next times are faster |
| **Commands not showing** | Type "CodeMentor" in command palette to see all commands |
| **VSIX file won't install** | Try installing from VS Code menu: Extensions → Install from VSIX |
| **AI gives wrong suggestions** | AI is not perfect. Use your brain too! |

---

## 🔗 **Links**

- **GitHub Repository:** https://github.com/Sahana-11pixel/CodeMentor
- **Report Issues:** https://github.com/Sahana-11pixel/CodeMentor/issues

---




---

**This README is now complete and in simple English!** 🚀
