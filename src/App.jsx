import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [systemMessage, setSystemMessage] = useState('Email system ready. Tap the microphone to start. Available commands: compose email, read emails, or stop.');
  const [appState, setAppState] = useState('idle'); // idle, listeningForCommand, composeRecipient, composeSubject, composeMessage, confirmSend
  const [emailData, setEmailData] = useState({ recipient: '', subject: '', message: '' });
  
  const recognition = useRef(null);
  const isSpeakingRef = useRef(false);
  const appStateRef = useRef('idle');
  const emailDataRef = useRef({ recipient: '', subject: '', message: '' });
  const isSilentRestart = useRef(false);

  // Update refs to avoid stale closures in event handlers
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    emailDataRef.current = emailData;
  }, [emailData]);

  const sampleEmails = [
    { from: "Alice", subject: "Meeting tomorrow", body: "Don't forget our meeting at 10 AM." },
    { from: "Bob", subject: "Lunch?", body: "Are we still on for lunch?" }
  ];

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(550, audioCtx.currentTime); // Gentle high beep
      gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime); // Low volume
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.08); // 80ms beep
    } catch (e) {
      console.log("AudioContext beep failed:", e);
    }
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
    setSystemMessage(text);
    if ('speechSynthesis' in window) {
      isSpeakingRef.current = true;
      stopListening(); // Stop recognition while system speaks to avoid feedback
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Set warm, professional voice parameters
      utterance.rate = 0.95; // Calm, steady pace (slightly slower than default 1.0)
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
        const currentTranscript = event.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '').trim();
        setTranscript(currentTranscript);
        handleCommand(currentTranscript);
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
        } else if (event.error === 'no-speech') {
          // Restart listening on silence timeout if still in active state
          setTimeout(() => {
            if (appStateRef.current !== 'idle' && !isSpeakingRef.current) {
              isSilentRestart.current = true;
              startListening();
            }
          }, 100);
        }
      };
    } else {
      setSystemMessage("Speech recognition is not supported in this browser.");
    }

    return () => {
      if (recognition.current) {
        recognition.current.stop();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCommand = (command) => {
    const currentState = appStateRef.current;

    // Global escape hatch for composition states
    const isComposing = ['composeRecipient', 'composeSubject', 'composeMessage', 'confirmSend'].includes(currentState);
    if (isComposing && (command === 'stop' || command === 'cancel' || command === 'start over' || command === 'exit' || command === 'quit')) {
      setEmailData({ recipient: '', subject: '', message: '' });
      speak("Email cancelled. Back to main menu. Say compose email, read emails, or stop.", () => {
        setAppState('listeningForCommand');
        startListening();
      });
      return;
    }
    
    if (currentState === 'listeningForCommand') {
      if (command.includes('compose email') || command.includes('send email') || command.includes('compose')) {
        setAppState('composeRecipient');
        speak("Who is the recipient?", startListening);
      } else if (command.includes('read inbox') || command.includes('read email') || command.includes('read')) {
        readEmails();
      } else if (command.includes('stop') || command.includes('exit') || command.includes('pause') || command.includes('quit')) {
        speak("System paused. Tap the microphone to start again.");
        setAppState('idle');
      } else {
        speak("Command not recognized. Please say compose email, read emails, or stop.", startListening);
      }
    } else if (currentState === 'composeRecipient') {
      setEmailData(prev => ({ ...prev, recipient: command }));
      setAppState('composeSubject');
      speak("What is the subject?", startListening);
    } else if (currentState === 'composeSubject') {
      setEmailData(prev => ({ ...prev, subject: command }));
      setAppState('composeMessage');
      speak("What is the message?", startListening);
    } else if (currentState === 'composeMessage') {
      const finalEmail = { ...emailDataRef.current, message: command };
      setEmailData(finalEmail);
      setAppState('confirmSend');
      speak(`Sending to ${finalEmail.recipient}. Subject is ${finalEmail.subject}. Message: ${command}. Say send to confirm, or cancel.`, startListening);
    } else if (currentState === 'confirmSend') {
      if (command.includes('send') || command.includes('yes') || command.includes('confirm')) {
        speak("Email sent successfully. Back to main menu. Say compose email, read emails, or stop.", () => {
          setAppState('listeningForCommand');
          startListening();
        });
        setEmailData({ recipient: '', subject: '', message: '' });
      } else if (command.includes('cancel') || command.includes('no') || command.includes('stop')) {
        speak("Email cancelled. Back to main menu. Say compose email, read emails, or stop.", () => {
          setAppState('listeningForCommand');
          startListening();
        });
        setEmailData({ recipient: '', subject: '', message: '' });
      } else {
        speak("Please say send to confirm, or cancel.", startListening);
      }
    }
  };

  const readEmails = () => {
    let text = `You have ${sampleEmails.length} emails. `;
    sampleEmails.forEach((email, index) => {
      text += `Email ${index + 1}. From ${email.from}. Subject: ${email.subject}. Message: ${email.body}. `;
    });
    text += "Back to main menu. Say compose email, read emails, or stop.";
    speak(text, () => {
      setAppState('listeningForCommand');
      startListening();
    });
  };

  const initSystem = () => {
    setAppState('listeningForCommand');
    speak("Email system ready. You can say compose email, read emails, or stop. What would you like to do?", startListening);
  };

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

        <div className="command-log">
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
