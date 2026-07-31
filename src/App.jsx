import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const INITIAL_INBOX_EMAILS = [
  { id: 1, from: "Alice", email: "alice@example.com", subject: "Meeting tomorrow", body: "Don't forget our meeting at 10 AM." },
  { id: 2, from: "Bob", email: "bob@example.com", subject: "Lunch?", body: "Are we still on for lunch?" }
];

function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [systemMessage, setSystemMessage] = useState(
    SpeechRecognition
      ? 'welcome to the voice controll Email system, Available commands: compose email, read inbox, reply to email, delete email, or stop or help.'
      : 'Speech recognition is not supported in this browser.'
  );
  const [appState, setAppState] = useState('idle'); // idle, listeningForCommand, composeRecipient, composeSubject, composeMessage, confirmSend, replySelectEmail, deleteSelectEmail
  const [emailData, setEmailData] = useState({ recipient: '', subject: '', message: '' });
  const [speechRate, setSpeechRate] = useState(0.95);
  
  const [inboxEmails, setInboxEmails] = useState(() => {
    try {
      const saved = localStorage.getItem('antigravity_inbox_emails');
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load inbox emails from localStorage", e);
    }
    return INITIAL_INBOX_EMAILS;
  });

  const recognition = useRef(null);
  const isSpeakingRef = useRef(false);
  const appStateRef = useRef('idle');
  const emailDataRef = useRef({ recipient: '', subject: '', message: '' });
  const inboxEmailsRef = useRef(inboxEmails);
  const isSilentRestart = useRef(false);
  const speechRateRef = useRef(0.95);
  const lastSpokenTextRef = useRef('welcome to the voice controll Email system, Available commands are: compose email, read emails, reply to email, delete email, or stop.');
  const utteranceRef = useRef(null);

  // Update refs to avoid stale closures in event handlers
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    emailDataRef.current = emailData;
  }, [emailData]);

  useEffect(() => {
    inboxEmailsRef.current = inboxEmails;
    try {
      localStorage.setItem('antigravity_inbox_emails', JSON.stringify(inboxEmails));
    } catch (e) {
      console.error("Failed to save inbox emails to localStorage", e);
    }
  }, [inboxEmails]);

  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  const playTone = (frequency = 440, type = 'sine', duration = 0.1, volume = 0.04) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.log("AudioContext tone failed:", e);
    }
  };

  const playBeep = () => {
    playTone(550, 'sine', 0.08, 0.04);
  };

  const playSuccessSound = () => {
    playTone(520, 'sine', 0.08, 0.04);
    setTimeout(() => playTone(660, 'sine', 0.08, 0.04), 100);
  };

  const playErrorSound = () => {
    playTone(220, 'triangle', 0.22, 0.05);
  };

  const playCancelSound = () => {
    playTone(400, 'sine', 0.08, 0.04);
    setTimeout(() => playTone(320, 'sine', 0.12, 0.04), 100);
  };

  // Helper to start recognition safely
  const startListening = () => {
    if (recognition.current && !isSpeakingRef.current) {
      setIsListening(true);
      setTranscript(''); // Clear previous text
      
      // Play a beep sound if it's a fresh prompt (not a silent/automatic restart)
      if (!isSilentRestart.current) {
        playBeep();
      }
      isSilentRestart.current = false; // Reset the flag after starting
      
      try {
        recognition.current.start();
      } catch (e) {
        // Recognition might already be running, ignore error
        console.log("Recognition start ignored:", e);
      }
    }
  };

  // Helper to stop recognition safely
  const stopListening = () => {
    if (recognition.current) {
      try {
        recognition.current.stop();
      } catch (e) {
        console.log("Recognition stop ignored:", e);
      }
    }
    setIsListening(false);
  };

  const speak = (text, callback = null) => {
    lastSpokenTextRef.current = text;
    setSystemMessage(text);
    if ('speechSynthesis' in window) {
      isSpeakingRef.current = true;
      stopListening(); // Stop recognition while system speaks to avoid feedback
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance; // Prevent garbage collection
      
      // Set warm, professional voice parameters
      utterance.rate = speechRateRef.current;
      utterance.pitch = 1.05; // Reassuring, warm pitch (slightly higher than default 1.0)
      
      // Try to select a high-quality natural English voice
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('Aria') || v.name.includes('David')));
      if (naturalVoice) {
        utterance.voice = naturalVoice;
      } else {
        const englishVoice = voices.find(v => v.lang.startsWith('en'));
        if (englishVoice) {
          utterance.voice = englishVoice;
        }
      }
      
      const handleSpeechEnd = () => {
        isSpeakingRef.current = false;
        isSilentRestart.current = false; // Fresh start from a spoken prompt
        utteranceRef.current = null; // Clean up the ref when finished
        if (callback) {
          setTimeout(callback, 300);
        } else {
          // If the system is still active, automatically resume listening
          if (appStateRef.current !== 'idle') {
            startListening();
          }
        }
      };

      utterance.onend = handleSpeechEnd;
      utterance.onerror = (e) => {
        console.error("SpeechSynthesis error:", e);
        handleSpeechEnd();
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      if (callback) callback();
    }
  };

  const resolveEmailFromInput = (inputStr) => {
    const emails = inboxEmailsRef.current;
    if (!emails || emails.length === 0) return null;

    const lower = inputStr.toLowerCase().trim();

    // Check by number / position keywords
    if (lower.includes('1') || lower.includes('one') || lower.includes('first')) {
      return emails[0] ? { email: emails[0], index: 0 } : null;
    }
    if (lower.includes('2') || lower.includes('two') || lower.includes('second')) {
      return emails[1] ? { email: emails[1], index: 1 } : null;
    }
    if (lower.includes('3') || lower.includes('three') || lower.includes('third')) {
      return emails[2] ? { email: emails[2], index: 2 } : null;
    }
    if (lower.includes('4') || lower.includes('four') || lower.includes('fourth')) {
      return emails[3] ? { email: emails[3], index: 3 } : null;
    }
    if (lower.includes('5') || lower.includes('five') || lower.includes('fifth')) {
      return emails[4] ? { email: emails[4], index: 4 } : null;
    }

    // Check by sender name match
    const matchedIndex = emails.findIndex(e => 
      lower.includes(e.from.toLowerCase()) || e.from.toLowerCase().includes(lower)
    );
    if (matchedIndex !== -1) {
      return { email: emails[matchedIndex], index: matchedIndex };
    }

    return null;
  };

  const initiateReply = (targetEmail) => {
    const recipient = targetEmail.email || targetEmail.from;
    const replySubject = targetEmail.subject.startsWith('Re:') 
      ? targetEmail.subject 
      : `Re: ${targetEmail.subject}`;

    setEmailData({ recipient, subject: replySubject, message: '' });
    setAppState('composeMessage');
    speak(`Replying to ${targetEmail.from}. What is your message?`, startListening);
  };

  const deleteInboxEmailByIndex = (index) => {
    const emails = inboxEmailsRef.current;
    if (index < 0 || index >= emails.length) return false;

    const deletedEmail = emails[index];
    const updatedEmails = emails.filter((_, i) => i !== index);
    setInboxEmails(updatedEmails);
    
    playSuccessSound();
    const remainingText = updatedEmails.length === 0 
      ? "Your inbox is now empty." 
      : `You have ${updatedEmails.length} email${updatedEmails.length > 1 ? 's' : ''} remaining.`;

    speak(`Email 1 from ${deletedEmail.from} has been deleted. ${remainingText} Back to main menu. Say compose email, read inbox, or stop.`, () => {
      setAppState('listeningForCommand');
      startListening();
    });
    return true;
  };

  const deleteAllInboxEmails = () => {
    setInboxEmails([]);
    playSuccessSound();
    speak("All inbox emails have been deleted. Your inbox is empty. Back to main menu. Say compose email, read sent emails, or stop.", () => {
      setAppState('listeningForCommand');
      startListening();
    });
  };

  const readEmails = () => {
    const emails = inboxEmailsRef.current;
    if (!emails || emails.length === 0) {
      speak("Your inbox is empty. Back to main menu. Say compose email, read sent emails, or stop.", () => {
        setAppState('listeningForCommand');
        startListening();
      });
      return;
    }

    let text = `You have ${emails.length} incoming email${emails.length > 1 ? 's' : ''}. `;
    emails.forEach((email, index) => {
      text += `Email ${index + 1}. From ${email.from}. Subject: ${email.subject}. Message: ${email.body}. `;
    });
    text += "Back to main menu. Say reply to email 1, delete email 1, compose email, read inbox, or stop.";
    speak(text, () => {
      setAppState('listeningForCommand');
      startListening();
    });
  };

  const readSentEmails = () => {
    let sentEmails = [];
    try {
      sentEmails = JSON.parse(localStorage.getItem('antigravity_sent_emails') || '[]');
    } catch (e) {
      console.error("Failed to read from localStorage", e);
    }

    if (sentEmails.length === 0) {
      speak("You have not sent any emails yet. Back to main menu. Say compose email, read inbox, read sent emails, or stop.", () => {
        setAppState('listeningForCommand');
        startListening();
      });
      return;
    }

    let text = `You have sent ${sentEmails.length} emails. `;
    sentEmails.forEach((email, index) => {
      text += `Email ${index + 1}. To ${email.to}. Subject: ${email.subject}. Message: ${email.body}. `;
    });
    text += "Back to main menu. Say compose email, read inbox, read sent emails, or stop.";
    speak(text, () => {
      setAppState('listeningForCommand');
      startListening();
    });
  };

  const handleCommand = (rawCommand) => {
    const currentState = appStateRef.current;
    
    // Normalize command for state matching and control phrases
    const command = rawCommand.toLowerCase().replace(/[.,!?]/g, '').trim();

    // Global speed adjustment commands
    if (command === 'speak faster' || command === 'faster') {
      const newRate = Math.min(2.0, speechRateRef.current + 0.15);
      setSpeechRate(newRate);
      speak(`Speed increased to ${Math.round(newRate * 100)} percent.`, startListening);
      return;
    }
    if (command === 'speak slower' || command === 'slower') {
      const newRate = Math.max(0.5, speechRateRef.current - 0.15);
      setSpeechRate(newRate);
      speak(`Speed decreased to ${Math.round(newRate * 100)} percent.`, startListening);
      return;
    }
    if (command === 'normal speed' || command === 'reset speed') {
      setSpeechRate(0.95);
      speak("Speed reset to normal.", startListening);
      return;
    }

    // Global repeat command
    if (command === 'repeat' || command === 'say that again' || command === 'repeat last') {
      speak(lastSpokenTextRef.current, startListening);
      return;
    }

    // Global help command
    if (command === 'help' || command.includes('help') || command === 'what can i say') {
      let helpText = '';
      if (currentState === 'listeningForCommand' || currentState === 'idle') {
        helpText = "Here are the available commands: Say compose email, to write a new email. Say read inbox, to read incoming emails. Say reply to email 1, to reply to an email. Say delete email 1, to delete an email. Say read sent emails, to read sent emails. Say stop, to pause. What would you like to do?";
      } else if (currentState === 'replySelectEmail') {
        helpText = "Say email 1, email 2, or the sender's name to reply, or say cancel to return to the main menu.";
      } else if (currentState === 'deleteSelectEmail') {
        helpText = "Say email 1, email 2, sender's name, or say all to delete emails, or say cancel to return to the main menu.";
      } else if (currentState === 'composeRecipient') {
        helpText = "You are composing an email. Please speak the recipient's email address, or say cancel to return to the main menu.";
      } else if (currentState === 'composeSubject') {
        helpText = "Please speak the subject of the email, or say cancel to return to the main menu.";
      } else if (currentState === 'composeMessage') {
        helpText = "Please speak the message body of the email, or say cancel to return to the main menu.";
      } else if (currentState === 'confirmSend') {
        helpText = "Say send to open your mail app and send, or cancel to return to the main menu.";
      }
      speak(helpText, startListening);
      return;
    }

    // Global escape hatch for interactive states
    const isInteractiveState = ['composeRecipient', 'composeSubject', 'composeMessage', 'confirmSend', 'replySelectEmail', 'deleteSelectEmail'].includes(currentState);
    if (isInteractiveState && (command === 'stop' || command === 'cancel' || command === 'start over' || command === 'exit' || command === 'quit')) {
      setEmailData({ recipient: '', subject: '', message: '' });
      playCancelSound();
      speak("Email action cancelled. Back to main menu. Say compose email, read inbox, or stop.", () => {
        setAppState('listeningForCommand');
        startListening();
      });
      return;
    }
    
    if (currentState === 'listeningForCommand') {
      if (command.includes('compose email') || command.includes('send email') || command.includes('compose')) {
        setAppState('composeRecipient');
        speak("Who is the recipient?", startListening);
      } else if (command.includes('read sent')) {
        readSentEmails();
      } else if (command.includes('read inbox') || command.includes('read email') || command.includes('read')) {
        readEmails();
      } else if (command.includes('reply')) {
        const resolved = resolveEmailFromInput(rawCommand);
        if (resolved) {
          initiateReply(resolved.email);
        } else {
          const emails = inboxEmailsRef.current;
          if (!emails || emails.length === 0) {
            speak("Your inbox is empty. There are no emails to reply to. Back to main menu.", startListening);
          } else {
            setAppState('replySelectEmail');
            speak("Which email would you like to reply to? Say email 1, email 2, or say sender name.", startListening);
          }
        }
      } else if (command.includes('delete') || command.includes('remove')) {
        if (command.includes('all') || command.includes('everything')) {
          deleteAllInboxEmails();
        } else {
          const resolved = resolveEmailFromInput(rawCommand);
          if (resolved) {
            deleteInboxEmailByIndex(resolved.index);
          } else {
            const emails = inboxEmailsRef.current;
            if (!emails || emails.length === 0) {
              speak("Your inbox is empty. There are no emails to delete. Back to main menu.", startListening);
            } else {
              setAppState('deleteSelectEmail');
              speak("Which email would you like to delete? Say email 1, email 2, sender name, or say all.", startListening);
            }
          }
        }
      } else if (command.includes('stop') || command.includes('exit') || command.includes('pause') || command.includes('quit')) {
        speak("System paused. Tap the microphone to start again.");
        setAppState('idle');
      } else {
        playErrorSound();
        speak("Command not recognized. Please say compose email, read inbox, reply to email, delete email, or stop.", startListening);
      }
    } else if (currentState === 'replySelectEmail') {
      const resolved = resolveEmailFromInput(rawCommand);
      if (resolved) {
        initiateReply(resolved.email);
      } else {
        playErrorSound();
        speak("Could not find that email. Please say email 1, email 2, or sender name, or say cancel.", startListening);
      }
    } else if (currentState === 'deleteSelectEmail') {
      if (command.includes('all') || command.includes('everything')) {
        deleteAllInboxEmails();
      } else {
        const resolved = resolveEmailFromInput(rawCommand);
        if (resolved) {
          deleteInboxEmailByIndex(resolved.index);
        } else {
          playErrorSound();
          speak("Could not find that email. Please say email 1, email 2, sender name, or say all, or cancel.", startListening);
        }
      }
    } else if (currentState === 'composeRecipient') {
      // Parse email address by converting verbal keywords like "at" to "@" and "dot" to "."
      const formattedEmail = rawCommand.toLowerCase()
        .replace(/\s+at\s+/g, '@')
        .replace(/\s+dot\s+/g, '.')
        .replace(/\s+period\s+/g, '.')
        .replace(/\s+full\s*stop\s+/g, '.')
        .replace(/\s+/g, '');
      
      setEmailData(prev => ({ ...prev, recipient: formattedEmail }));
      setAppState('composeSubject');
      speak("What is the subject?", startListening);
    } else if (currentState === 'composeSubject') {
      setEmailData(prev => ({ ...prev, subject: rawCommand.trim() }));
      setAppState('composeMessage');
      speak("What is the message?", startListening);
    } else if (currentState === 'composeMessage') {
      // Convert verbal punctuation keywords to actual punctuation marks
      let formattedMessage = rawCommand.trim();
      formattedMessage = formattedMessage
        .replace(/\b(dot|period|full\s*stop)\b/gi, '.')
        .replace(/\bcomma\b/gi, ',')
        .replace(/\bquestion\s*mark\b/gi, '?')
        .replace(/\bexclamation\s*(mark|point)\b/gi, '!');
      
      // Clean up spacing around punctuation
      formattedMessage = formattedMessage
        .replace(/\s+\./g, '.')
        .replace(/\s+,/g, ',')
        .replace(/\s+\?/g, '?')
        .replace(/\s+!/g, '!');
        
      // Capitalize first letter of sentences
      formattedMessage = formattedMessage.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());

      const finalEmail = { ...emailDataRef.current, message: formattedMessage };
      setEmailData(finalEmail);
      setAppState('confirmSend');
      speak(`Sending to ${finalEmail.recipient}. Subject is ${finalEmail.subject}. Message: ${formattedMessage}. Say send to confirm, or cancel.`, startListening);
    } else if (currentState === 'confirmSend') {
      if (command.includes('send') || command.includes('yes') || command.includes('confirm')) {
        const mailtoLink = `mailto:${emailDataRef.current.recipient}?subject=${encodeURIComponent(emailDataRef.current.subject)}&body=${encodeURIComponent(emailDataRef.current.message)}`;
        
        // Save to sent history in localStorage
        try {
          const sentEmails = JSON.parse(localStorage.getItem('antigravity_sent_emails') || '[]');
          const newSentEmail = {
            to: emailDataRef.current.recipient,
            subject: emailDataRef.current.subject,
            body: emailDataRef.current.message,
            timestamp: new Date().toISOString()
          };
          sentEmails.unshift(newSentEmail); // Put newest first
          localStorage.setItem('antigravity_sent_emails', JSON.stringify(sentEmails));
        } catch (e) {
          console.error("Failed to save to localStorage", e);
        }

        playSuccessSound();
        speak("Opening your default mail application. Please confirm and send the email from there. Returning to the main menu.", () => {
          window.location.href = mailtoLink;
          setAppState('listeningForCommand');
          setEmailData({ recipient: '', subject: '', message: '' });
        });
      } else if (command.includes('cancel') || command.includes('no') || command.includes('stop')) {
        playCancelSound();
        speak("Email cancelled. Back to main menu. Say compose email, read emails, or stop.", () => {
          setAppState('listeningForCommand');
          startListening();
        });
        setEmailData({ recipient: '', subject: '', message: '' });
      } else {
        playErrorSound();
        speak("Please say send to confirm, or cancel.", startListening);
      }
    }
  };

  const initSystem = () => {
    setAppState('listeningForCommand');
    speak("welcome to the voice controll Email system, Available commands: compose email, read inbox, reply to email, delete email, or stop or help.", startListening);
  };

  useEffect(() => {
    if (SpeechRecognition) {
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = false;
      recognition.current.interimResults = false;
      recognition.current.lang = 'en-US';

      recognition.current.onstart = () => {
        setIsListening(true);
      };

      recognition.current.onresult = (event) => {
        const rawTranscript = event.results[0][0].transcript;
        setTranscript(rawTranscript);
        handleCommand(rawTranscript);
      };

      recognition.current.onend = () => {
        setIsListening(false);
        // Automatically restart listening if still in active state and not speaking
        setTimeout(() => {
          if (appStateRef.current !== 'idle' && !isSpeakingRef.current) {
            isSilentRestart.current = true;
            startListening();
          }
        }, 100);
      };

      recognition.current.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          speak("Microphone access denied. Please allow microphone permissions.");
          setAppState('idle');
        } else if (event.error === 'no-speech' || event.error === 'aborted') {
          // Restart listening on silence timeout or abort if still in active state
          setTimeout(() => {
            if (appStateRef.current !== 'idle' && !isSpeakingRef.current) {
              isSilentRestart.current = true;
              startListening();
            }
          }, 100);
        }
      };

      window.__testHandleCommand = handleCommand;
      window.__testInitSystem = initSystem;
      window.__testStartListening = startListening;
      window.__testInboxEmails = () => inboxEmailsRef.current;
    }

    return () => {
      if (recognition.current) {
        recognition.current.stop();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      delete window.__testHandleCommand;
      delete window.__testInitSystem;
      delete window.__testStartListening;
      delete window.__testInboxEmails;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-container">
      <header>
        <h1>Voice Assistant</h1>
      </header>
      
      <main className="console-layout">
        
        <div className="mic-container">
          <button 
            className={`mic-button ${isListening ? 'listening' : ''}`}
            onClick={appState === 'idle' ? initSystem : startListening}
            aria-label={appState === 'idle' ? "Start System" : "Activate Microphone"}
            autoFocus
          >
            <svg className="mic-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
            </svg>
          </button>
          
          <div className="status-indicator">
            {isListening ? "Listening..." : (appState === 'idle' ? "Tap to Start" : "Waiting for command...")}
          </div>
          
          {isListening && (
            <div className="voice-waves">
              <div className="wave"></div>
              <div className="wave"></div>
              <div className="wave"></div>
              <div className="wave"></div>
            </div>
          )}
        </div>

        <div className="command-log" aria-live="polite">
          <div className="log-entry user-log">
            <span className="log-label">You:</span>
            <span className="log-text">{transcript || "..."}</span>
          </div>
          <div className="log-entry system-log">
            <span className="log-label">System:</span>
            <span className="log-text">{systemMessage}</span>
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;

