import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [systemMessage, setSystemMessage] = useState('Welcome. Tap the microphone to start.');
  const [appState, setAppState] = useState('idle'); // idle, listeningForCommand, composeRecipient, composeSubject, composeMessage, confirmSend
  const [emailData, setEmailData] = useState({ recipient: '', subject: '', message: '' });
  
  const recognition = useRef(null);

  const sampleEmails = [
    { from: "Alice", subject: "Meeting tomorrow", body: "Don't forget our meeting at 10 AM." },
    { from: "Bob", subject: "Lunch?", body: "Are we still on for lunch?" }
  ];

  useEffect(() => {
    if (SpeechRecognition) {
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = false;
      recognition.current.interimResults = false;
      recognition.current.lang = 'en-US';

      recognition.current.onresult = (event) => {
        const currentTranscript = event.results[0][0].transcript.toLowerCase().replace(/[.,!?]/g, '');
        setTranscript(currentTranscript);
        handleCommand(currentTranscript);
      };

      recognition.current.onend = () => {
        setIsListening(false);
      };

      recognition.current.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
            speak("Microphone access denied. Please allow microphone permissions.");
        }
        setIsListening(false);
      };
    } else {
      setSystemMessage("Speech recognition is not supported in this browser.");
    }
  }, [appState, emailData]);

  const speak = (text, callback = null) => {
    setSystemMessage(text);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => {
        if (callback) {
            setTimeout(callback, 300);
        } else {
            // Auto listening mode after system speaks, if in middle of flow
            if (appState !== 'idle' && appState !== 'confirmSend') {
               startListening();
            }
        }
      };
      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = () => {
    if (recognition.current && !isListening) {
      setIsListening(true);
      setTranscript(''); // Clear previous transcript when starting to listen
      try {
        recognition.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleCommand = (command) => {
    if (appState === 'idle' || appState === 'listeningForCommand') {
      if (command.includes('compose email') || command.includes('send email') || command.includes('compose')) {
        setAppState('composeRecipient');
        speak("Who is the recipient?", startListening);
      } else if (command.includes('read inbox') || command.includes('read email') || command.includes('read')) {
        readEmails();
      } else {
        speak("Command not recognized. Please say compose email or read inbox.", startListening);
      }
    } else if (appState === 'composeRecipient') {
      setEmailData(prev => ({ ...prev, recipient: command }));
      setAppState('composeSubject');
      speak("What is the subject?", startListening);
    } else if (appState === 'composeSubject') {
      setEmailData(prev => ({ ...prev, subject: command }));
      setAppState('composeMessage');
      speak("What is the message?", startListening);
    } else if (appState === 'composeMessage') {
      setEmailData(prev => ({ ...prev, message: command }));
      setAppState('confirmSend');
      speak(`Sending to ${emailData.recipient}. Subject is ${emailData.subject}. Message: ${command}. Say send to confirm, or cancel.`, startListening);
    } else if (appState === 'confirmSend') {
      if (command.includes('send') || command.includes('yes') || command.includes('confirm')) {
        speak("Email sent successfully.");
        setAppState('idle');
        setEmailData({ recipient: '', subject: '', message: '' });
      } else if (command.includes('cancel') || command.includes('no') || command.includes('stop')) {
        speak("Email cancelled.");
        setAppState('idle');
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
    speak(text);
    setAppState('idle');
  };

  const initSystem = () => {
    setAppState('listeningForCommand');
    speak("Welcome. Say a command.", startListening);
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
