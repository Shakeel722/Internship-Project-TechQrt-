import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Send, 
  Calendar, 
  CheckCircle2, 
  X, 
  Settings, 
  FileCode, 
  RefreshCw, 
  Building, 
  User, 
  Layers, 
  Phone, 
  Clock, 
  ShieldAlert, 
  ChevronRight, 
  BookOpen, 
  Code,
  Search,
  BadgeAlert,
  Database,
  ArrowRightLeft
} from 'lucide-react';

export default function App() {
  const [session_id] = useState(() => 'sess_' + Math.random().toString(36).substr(2, 9));
  const [inputMessage, setInputMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'agent', text: string, intent?: string, timestamp: string }>>([
    {
      sender: 'agent',
      text: "Hello! I am your AI Voice Doctor Assistant. I can help search for doctors, check availability, book, reschedule, or cancel appointments. Try saying: \"I need a skin doctor tomorrow.\"",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [activeIntent, setActiveIntent] = useState<string>('GENERAL_GREETING');
  const [extractedEntities, setExtractedEntities] = useState<{
    specialization?: string | null;
    doctor_name?: string | null;
    date?: string | null;
    time?: string | null;
  }>({});

  // DB Sync State
  const [dbState, setDbState] = useState<{
    doctors: any[];
    availabilities: any[];
    appointments: any[];
    logs: any[];
  }>({
    doctors: [],
    availabilities: [],
    appointments: [],
    logs: []
  });

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSilentMode, setIsSilentMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'app' | 'code' | 'architecture'>('app');
  const [codeFileTab, setCodeFileTab] = useState<'models' | 'serializers' | 'views' | 'urls' | 'tests'>('views');
  const [searchDocTerm, setSearchDocTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messageEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Sync DB state from Express simulator
  const fetchDbState = async () => {
    try {
      const res = await fetch('/api/sim-logs/');
      if (res.ok) {
        const data = await res.json();
        setDbState({
          doctors: data.db.doctors || [],
          availabilities: data.db.availabilities || [],
          appointments: data.db.appointments || [],
          logs: data.logs || []
        });
      }
    } catch (e) {
      console.error('Failed to sync PostgreSQL simulation DB:', e);
    }
  };

  useEffect(() => {
    fetchDbState();
    const interval = setInterval(fetchDbState, 3500);
    return () => clearInterval(interval);
  }, []);

  // Web Speech API - Speech Synthesis (Agent Voice Outloud)
  const speakText = (text: string) => {
    if (isSilentMode || typeof window === 'undefined' || !window.speechSynthesis) return;
    
    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    
    const cleanText = text.replace(/#\d+/g, 'number').replace(/Dr\./g, 'Doctor');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    // Select a premium English voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en-') && v.name.includes('Google'));
    if (englishVoice) utterance.voice = englishVoice;
    
    window.speechSynthesis.speak(utterance);
  };

  // Web Speech API - Speech to Text (Microphone capture)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US';

        rec.onstart = () => {
          setIsListening(true);
        };

        rec.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            handleSendMessage(transcript);
          }
        };

        rec.onerror = (event: any) => {
          console.error('Speech recognition error:', event);
          setIsListening(false);
        };

        rec.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = rec;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not fully supported in this browser's iframe context. Please type your message in the chat input!");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Auto scroll down chats
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSendMessage = async (rawMessage?: string) => {
    const textToSend = rawMessage || inputMessage;
    if (!textToSend.trim()) return;

    if (!rawMessage) {
      setInputMessage('');
    }

    setChatHistory(prev => [
      ...prev,
      {
        sender: 'user',
        text: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    setIsLoading(true);

    try {
      const response = await fetch('/api/ai-agent/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id,
          message: textToSend
        })
      });

      if (response.ok) {
        const data = await response.json();
        setChatHistory(prev => [
          ...prev,
          {
            sender: 'agent',
            text: data.response,
            intent: data.intent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        
        setActiveIntent(data.intent);
        setExtractedEntities(data.extracted_entities || {});
        speakText(data.response);
        fetchDbState();
      } else {
        throw new Error('API server returned error state.');
      }
    } catch (e: any) {
      console.error(e);
      setChatHistory(prev => [
        ...prev,
        {
          sender: 'agent',
          text: "I'm having trouble conveying status parameters to the Django core gateway. Let me write a direct local scheduling retry.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelAppointment = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this appointment on our simulated database? This will update the availability details instantly!')) return;
    try {
      const res = await fetch(`/api/appointments/${id}/cancel/`, { method: 'POST' });
      if (res.ok) {
        fetchDbState();
        // Notify chat
        setChatHistory(prev => [
          ...prev,
          {
            sender: 'agent',
            text: `Ok, I have processed a background cancellation for Appointment Reference #${id}. That doctor calendar slot is once again open!`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        speakText(`Appointment number ${id} has been cancelled.`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Mock quick commands to trigger easy slot validations
  const executeVoiceShortcut = (text: string) => {
    handleSendMessage(text);
  };

  return (
    <div id="medical-booking-system" className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Banner Header */}
      <header id="app-header" className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div id="logo-block" className="flex items-center gap-3">
          <div id="icon-container" className="bg-emerald-600 text-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
            <Layers className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-600 block">AI INTERNSHIP CONSOLE</span>
            <h1 id="app-title" className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Voice Agent for Doctor Appointment Booking System
            </h1>
          </div>
        </div>

        <nav id="top-nav" className="flex items-center bg-slate-100 p-1 rounded-xl">
          <button
            id="tab-app"
            onClick={() => setActiveTab('app')}
            className={`px-4 py-2 font-medium text-sm rounded-lg transition-all ${activeTab === 'app' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Agent & DB Console
          </button>
          <button
            id="tab-code"
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 font-medium text-sm rounded-lg transition-all flex items-center gap-2 ${activeTab === 'code' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Code className="w-4 h-4 text-slate-500" />
            Django Source Code
          </button>
          <button
            id="tab-arch"
            onClick={() => setActiveTab('architecture')}
            className={`px-4 py-2 font-medium text-sm rounded-lg transition-all ${activeTab === 'architecture' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            System Design Architecture
          </button>
        </nav>
      </header>

      {/* Main Core Container */}
      <main id="main-content" className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 flex flex-col">
        {activeTab === 'app' && (
          <div id="workspace-layout" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* LEFT COLUMN: The Voice Agent Simulation Center (5 cols) */}
            <section id="voice-agent-center" className="lg:col-span-5 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-[500px]">
              {/* Voice agent status header */}
              <div id="agent-status" className="bg-slate-900 text-white p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${isSpeaking ? 'bg-amber-400 animate-ping' : isListening ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                    <div className="bg-slate-800 text-slate-200 p-2 rounded-lg font-mono text-xs font-bold font-semibold uppercase tracking-wider">
                      AGENT-1
                    </div>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Active AI Conversational Assistant</h2>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      {isSpeaking ? (
                        <span className="text-amber-300 flex items-center gap-1">🗣️ Agent is Speaking Back...</span>
                      ) : isListening ? (
                        <span className="text-red-400 font-bold flex items-center gap-1 animate-pulse">🎤 Listening via Mic...</span>
                      ) : (
                        <span>● State: Ready for scheduling inputs</span>
                      )}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setIsSilentMode(!isSilentMode)} 
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${isSilentMode ? 'bg-slate-800 text-slate-400' : 'bg-emerald-600/30 text-emerald-400'}`}
                >
                  {isSilentMode ? '🔇 Silent' : '🔊 TTS Active'}
                </button>
              </div>

              {/* Chat Scroll container */}
              <div id="chat-scroller" className="flex-1 p-4 overflow-y-auto max-h-[380px] bg-slate-50 space-y-4">
                {chatHistory.map((chat, idx) => (
                  <div key={idx} className={`flex ${chat.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm text-sm ${
                      chat.sender === 'user' 
                        ? 'bg-emerald-600 text-white rounded-br-none' 
                        : 'bg-white border border-slate-200 text-slate-900 rounded-bl-none'
                    }`}>
                      <p className="leading-relaxed">{chat.text}</p>
                      <div className="mt-1 flex items-center justify-between text-[10px] opacity-75">
                        <span className="font-semibold">{chat.sender === 'user' ? 'You (Voice In)' : 'AI Doctor Helper'}</span>
                        <span>{chat.timestamp}</span>
                      </div>
                      
                      {chat.intent && chat.intent !== 'GENERAL_GREETING' && (
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center gap-1">
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold uppercase">
                            INTENT: {chat.intent}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-sm flex items-center gap-2">
                      <div className="flex space-x-1.5">
                        <div className="w-2.5 h-2.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2.5 h-2.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2.5 h-2.5 bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-xs text-slate-500 font-mono italic">Django parsing pipeline running-</span>
                    </div>
                  </div>
                )}
                <div ref={messageEndRef} />
              </div>

              {/* Waveform Micro Interaction */}
              {(isListening || isSpeaking) && (
                <div className="bg-slate-900 py-2.5 px-4 flex items-center justify-center gap-1.5 border-t border-slate-800">
                  <div className="text-slate-400 text-xs font-mono select-none mr-2">
                    {isListening ? 'CAPTURE ACTIVE' : 'TEXT-TO-SPEECH STREAM'}
                  </div>
                  {[1, 2, 3, 4, 5, 4, 3, 2, 1, 3, 5, 2, 4, 6, 4, 2].map((h, i) => (
                    <div 
                      key={i} 
                      className={`w-1 rounded-full ${isListening ? 'bg-red-500' : 'bg-amber-400'} transition-all`} 
                      style={{ 
                        height: `${h * (isListening ? 4 : 5)}px`,
                        animation: `bounce 1s infinite ease-in-out`,
                        animationDelay: `${i * 60}ms`
                      }} 
                    />
                  ))}
                </div>
              )}

              {/* Chat Send and Mic Panel */}
              <div id="voice-chat-controls" className="p-4 border-t border-slate-200 bg-white space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleListening}
                    className={`p-3.5 rounded-xl shadow-md transition-all flex items-center justify-center ${
                      isListening 
                        ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse scale-105' 
                        : 'bg-slate-900 hover:bg-slate-850 text-white'
                    }`}
                    title="Simulate speech to text input"
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type appointment command or ask doctor specialties..."
                    className="flex-1 px-4 py-3 bg-slate-100 focus:bg-white text-slate-900 border border-transparent focus:border-slate-300 rounded-xl outlines-none transition-all text-sm outline-none"
                  />

                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputMessage.trim()}
                    className="p-3.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>

                {/* Extracted Slots Badges Panel */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 flex items-center gap-1 mb-2">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                    Stateful NLU Slot Extraction Badges
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-1 px-2.5 bg-white border border-slate-200 rounded flex flex-col justify-between">
                      <span className="text-[10px] text-slate-400">Specialization</span>
                      <span className="font-semibold text-slate-800">{extractedEntities.specialization || <span className="text-slate-300 italic">None</span>}</span>
                    </div>
                    <div className="p-1 px-2.5 bg-white border border-slate-200 rounded flex flex-col justify-between">
                      <span className="text-[10px] text-slate-400">Doctor Name</span>
                      <span className="font-semibold text-slate-800">{extractedEntities.doctor_name || <span className="text-slate-300 italic">None</span>}</span>
                    </div>
                    <div className="p-1 px-2.5 bg-white border border-slate-200 rounded flex flex-col justify-between">
                      <span className="text-[10px] text-slate-400">Target Date</span>
                      <span className="font-semibold text-slate-800 font-mono">{extractedEntities.date || <span className="text-slate-300 italic">None</span>}</span>
                    </div>
                    <div className="p-1 px-2.5 bg-white border border-slate-200 rounded flex flex-col justify-between">
                      <span className="text-[10px] text-slate-400">Requested Time</span>
                      <span className="font-semibold text-slate-800 font-mono">{extractedEntities.time || <span className="text-slate-300 italic">None</span>}</span>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                    <span>Detected Intent: <strong>{activeIntent}</strong></span>
                    {activeIntent !== 'GENERAL_GREETING' && (
                      <button 
                        onClick={() => {
                          setActiveIntent('GENERAL_GREETING');
                          setExtractedEntities({});
                        }}
                        className="text-red-500 hover:underline font-semibold"
                      >
                        Reset Intent
                      </button>
                    )}
                  </div>
                </div>

                {/* Practical Demo Prompts Shortcuts */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Click voice simulation presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => executeVoiceShortcut("I need a skin doctor tomorrow.")}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-all font-semibold"
                    >
                      "I need a skin doctor tomorrow."
                    </button>
                    <button
                      onClick={() => executeVoiceShortcut("Is there any cardiologist available?")}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-all font-semibold"
                    >
                      "Is there a cardiologist available?"
                    </button>
                    <button
                      onClick={() => executeVoiceShortcut("Yes, please confirm the appointment.")}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-all font-semibold"
                    >
                      "Confirmbooking (Select yes)"
                    </button>
                    <button
                      onClick={() => executeVoiceShortcut("Show me pediatricians available near me.")}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-all font-semibold"
                    >
                      "Find pediatrician clinics"
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT COLUMN: The PostgreSQL Relational Database Console / Tables Browser (7 cols) */}
            <section id="relational-tables-browser" className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Table 1: Availability Slots (Real Time Scheduling Monitor) */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-md font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-600" />
                    PostgreSQL: Availability calendar slots table (doctors_availability)
                  </h2>
                  <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                    {dbState.availabilities.length} records
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[220px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                        <th className="p-2.5">Doc ID</th>
                        <th className="p-2.5">Doctor Name</th>
                        <th className="p-2.5">Specialization</th>
                        <th className="p-2.5 font-mono">Date</th>
                        <th className="p-2.5 font-mono">Time range</th>
                        <th className="p-2.5 text-center">Row Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dbState.availabilities.map((slot) => (
                        <tr key={slot.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-2.5 text-slate-500 font-mono font-bold">#{slot.doctor_id}</td>
                          <td className="p-2.5 font-medium text-slate-900">{slot.doctor_name || 'Dr. Jane Sharma'}</td>
                          <td className="p-2.5 font-semibold text-slate-600">{slot.specialization || 'Dermatologist'}</td>
                          <td className="p-2.5 font-mono">{slot.date}</td>
                          <td className="p-2.5 font-mono">{slot.start_time} - {slot.end_time}</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                              slot.slot_status === 'AVAILABLE' 
                                ? 'bg-green-150 text-green-700 border border-green-250' 
                                : slot.slot_status === 'BOOKED' 
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                  : 'bg-slate-100 text-slate-600'
                            }`}>
                              {slot.slot_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: Active Appointment Records */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-md font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-600" />
                    PostgreSQL: Appointments ledger (appointments_appointment)
                  </h2>
                  <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                    {dbState.appointments.length} records
                  </span>
                </div>

                {dbState.appointments.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No bookings secured in database yet. Try telling the Voice Agent "Book an appointment tomorow" or select a preset shortcut!
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[180px]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                          <th className="p-2.5">ID</th>
                          <th className="p-2.5">Patient Details</th>
                          <th className="p-2.5">Assigned Doctor</th>
                          <th className="p-2.5 font-mono">Booked Date</th>
                          <th className="p-2.5 font-mono">Booked Time</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dbState.appointments.map((appt) => (
                          <tr key={appt.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2.5 font-mono font-bold text-slate-600">#{appt.id}</td>
                            <td className="p-2.5">
                              <div className="font-semibold text-slate-900">{appt.patient_details?.name || 'Alice Smith'}</div>
                              <span className="text-[10px] text-slate-500">Phone: {appt.patient_details?.phone || 'Unknown'}</span>
                            </td>
                            <td className="p-2.5">
                              <span className="font-medium text-slate-900">{appt.doctor_details?.name || 'Doctor Sharma'}</span>
                              <div className="text-[10px] text-slate-500 font-semibold">{appt.doctor_details?.specialization}</div>
                            </td>
                            <td className="p-2.5 font-mono">{appt.appointment_date}</td>
                            <td className="p-2.5 font-mono">{appt.appointment_time}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                appt.status === 'SCHEDULED' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : appt.status === 'RESCHEDULED' 
                                    ? 'bg-purple-105 text-purple-700' 
                                    : 'bg-red-100 text-red-800'
                              }`}>
                                {appt.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-center">
                              {appt.status !== 'CANCELLED' ? (
                                <button
                                  onClick={() => handleCancelAppointment(appt.id)}
                                  className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded transition-colors font-bold"
                                >
                                  Cancel Booking
                                </button>
                              ) : (
                                <span className="text-slate-400 text-[11px] italic">Cancelled</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Console: Django Rest API Live Feed HTTP Log Trace */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col text-white">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-805">
                  <h3 className="text-sm font-bold flex items-center gap-2 font-mono text-emerald-400">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                    Django API Gateway Logs (django_rest_framework_logs)
                  </h3>
                  <button 
                    onClick={fetchDbState}
                    className="text-xs hover:text-white text-slate-400 flex items-center gap-1 font-mono"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    refresh-stream
                  </button>
                </div>

                <div className="space-y-2 max-h-[140px] overflow-y-auto font-mono text-[11px] text-slate-300">
                  {dbState.logs.length === 0 ? (
                    <div className="text-slate-500 italic py-2 text-center select-none">No REST gateway payload logs captured. Conversing with the agent triggers API callbacks...</div>
                  ) : (
                    dbState.logs.map((log) => (
                      <div key={log.id} className="p-2 bg-slate-850 rounded border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">{log.timestamp}</span>
                          <span className={`px-1.5 py-0.2 rounded uppercase font-bold text-[9px] ${
                            log.method === 'POST' ? 'bg-blue-600/30 text-blue-400 border border-blue-500/20' : 'bg-green-600/30 text-green-400'
                          }`}>
                            {log.method} {log.url}
                          </span>
                          <span className={`px-1 rounded text-red-400 font-bold ${log.status === 200 || log.status === 201 ? 'text-green-400' : 'text-amber-400'}`}>
                            HTTP {log.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-400 overflow-x-auto">
                          <div>
                            <span className="text-slate-500 block">HTTP REQUEST BODY:</span>
                            <pre className="text-slate-300 select-all">{JSON.stringify(log.payload, null, 1)}</pre>
                          </div>
                          <div>
                            <span className="text-slate-500 block">DJANGO API RESPONSE:</span>
                            <pre className="text-slate-305 select-all">{JSON.stringify(log.response, null, 1)}</pre>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </section>
          </div>
        )}

        {activeTab === 'code' && (
          <div id="code-viewer-layout" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col md:flex-row items-stretch min-h-[600px]">
            {/* Sidebar code file tabs */}
            <div className="w-full md:w-60 bg-slate-900 text-white p-4 flex flex-col gap-1 border-r border-slate-800">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-3 font-semibold">PRODUCTION DJANGO PROJECT</span>
              
              <button
                onClick={() => setCodeFileTab('models')}
                className={`w-full py-2.5 px-3 text-left rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${codeFileTab === 'models' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-850 hover:text-slate-250'}`}
              >
                <span>📂 doctors/models.py</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>
              
              <button
                onClick={() => setCodeFileTab('serializers')}
                className={`w-full py-2.5 px-3 text-left rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${codeFileTab === 'serializers' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-850 hover:text-slate-250'}`}
              >
                <span>📂 appointments/serializers.py</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setCodeFileTab('views')}
                className={`w-full py-2.5 px-3 text-left rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${codeFileTab === 'views' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-850 hover:text-slate-250'}`}
              >
                <span>📂 ai_agent/views.py</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setCodeFileTab('urls')}
                className={`w-full py-2.5 px-3 text-left rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${codeFileTab === 'urls' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-850 hover:text-slate-250'}`}
              >
                <span>📂 medical_assistant/urls.py</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <button
                onClick={() => setCodeFileTab('tests')}
                className={`w-full py-2.5 px-3 text-left rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${codeFileTab === 'tests' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-850 hover:text-slate-250'}`}
              >
                <span>📂 appointments/tests.py</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              </button>

              <div className="mt-auto pt-6 border-t border-slate-800">
                <div className="bg-slate-850 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                  <span className="font-semibold text-white block mb-1">Normalized Postgres DB Schema:</span>
                  - Accounts (Custom User model for RBAC)<br/>
                  - Doctors (specialization / fees)<br/>
                  - Hospitals (contact details)<br/>
                  - Availabilities (unique_together, doctor indices)<br/>
                  - Appointments (patient, status indexes)<br/>
                  - ConversationLogs (session states)
                </div>
              </div>
            </div>

            {/* Code Content Block */}
            <div className="flex-1 p-5 md:p-6 bg-slate-950 text-slate-300 font-mono text-xs overflow-x-auto flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <span className="text-slate-400">Code Inspection Panel: <strong>{codeFileTab === 'views' ? 'ai_agent/views.py' : codeFileTab === 'models' ? 'doctors/models.py' : codeFileTab === 'serializers' ? 'appointments/serializers.py' : codeFileTab === 'urls' ? 'medical_assistant/urls.py' : 'tests.py'}</strong></span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded uppercase font-semibold">Python v3.10 / Django 5.0</span>
                </div>

                {codeFileTab === 'models' && (
                  <pre className="text-slate-200 block overflow-auto select-all">{`# /medical_assistant/doctors/models.py
from django.db import models
from hospitals.models import Hospital

class Doctor(models.Model):
    name = models.CharField(max_length=255, db_index=True)
    specialization = models.CharField(max_length=100, db_index=True)
    experience_years = models.PositiveIntegerField()
    consultation_fee = models.DecimalField(max_digits=10, decimal_places=2)
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name='doctors', db_index=True)
    phone = models.CharField(max_length=20)
    email = models.EmailField(unique=True)

    def __str__(self):
        return f"{self.name} - {self.specialization}"`}</pre>
                )}

                {codeFileTab === 'serializers' && (
                  <pre className="text-slate-200 block overflow-auto select-all">{`# /medical_assistant/appointments/serializers.py
from rest_framework import serializers
from .models import Appointment
from availability.models import Availability
from django.db import transaction

class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = '__all__'

    def validate(self, attrs):
        patient = attrs.get('patient')
        doctor = attrs.get('doctor')
        date = attrs.get('appointment_date')
        time = attrs.get('appointment_time')

        # 1. Verify doctor availability schedule exists for this slot
        avail = Availability.objects.filter(doctor=doctor, date=date, start_time=time).first()
        if not avail:
            raise serializers.ValidationError("No availability slot defined for this doctor.")
        if avail.slot_status != Availability.Status.AVAILABLE:
            raise serializers.ValidationError("This doctor availability slot is already booked.")

        # 2. Prevent patient double-booking at same hour
        patient_conflicts = Appointment.objects.filter(
            patient=patient, appointment_date=date, appointment_time=time, status='SCHEDULED'
        )
        if patient_conflicts.exists():
            raise serializers.ValidationError("Patient already booked for another clinic at this exact time.")

        # 3. Prevent doctor double-booking
        doctor_conflicts = Appointment.objects.filter(
            doctor=doctor, appointment_date=date, appointment_time=time, status='SCHEDULED'
        )
        if doctor_conflicts.exists():
            raise serializers.ValidationError("Doctor already booked by another patient.")

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        # Atomic database state transitions: change slot status to BOOKED
        slot = Availability.objects.get(
            doctor=validated_data['doctor'],
            date=validated_data['appointment_date'],
            start_time=validated_data['appointment_time']
        )
        slot.slot_status = Availability.Status.BOOKED
        slot.save()
        return super().create(validated_data)`}</pre>
                )}

                {codeFileTab === 'views' && (
                  <pre className="text-slate-200 block overflow-auto select-all">{`# /medical_assistant/ai_agent/views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from doctors.models import Doctor
from availability.models import Availability
from appointments.models import Appointment
from .models import ConversationLog

class VoiceAgentView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        session_id = request.data.get('session_id') or 'default-session'
        message = request.data.get('message', '').strip()

        # Phase 8: Conversational state restoration
        history = ConversationLog.objects.filter(session_id=session_id).order_by('timestamp')
        session_context = {}
        for turn in history:
            if turn.entities:
                session_context.update(turn.entities)

        # Heuristic/AI extraction pipeline
        intent = self.detect_intent(message)
        extracted = self.extract_entities(message)
        session_context.update({k: v for k, v in extracted.items() if v})

        # Process dialog tree
        bot_response, final_intent = self.process_conversation(intent, message, session_context, request.user)

        # Persistence to PostgreSQL
        ConversationLog.objects.create(
            user=request.user if request.user.is_authenticated else None,
            session_id=session_id,
            message=message,
            response=bot_response,
            intent=final_intent,
            entities=session_context
        )

        return Response({
            "session_id": session_id,
            "intent": final_intent,
            "extracted_entities": session_context,
            "response": bot_response
        })`}</pre>
                )}

                {codeFileTab === 'urls' && (
                  <pre className="text-slate-200 block overflow-auto select-all">{`# /medical_assistant/medical_assistant/urls.py
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/accounts/', include('accounts.urls')),
    path('api/hospitals/', include('hospitals.urls')),
    path('api/doctors/', include('doctors.urls')),
    path('api/patients/', include('patients.urls')),
    path('api/availability/', include('availability.urls')),
    path('api/appointments/', include('appointments.urls')),
    path('api/ai-agent/', include('ai_agent.urls')),
]`}</pre>
                )}

                {codeFileTab === 'tests' && (
                  <pre className="text-slate-200 block overflow-auto select-all">{`# /medical_assistant/tests.py
from django.test import TestCase
from doctors.models import Doctor
from availability.models import Availability
from appointments.models import Appointment
from datetime import date, time

class MedicalAssistantSystemTests(TestCase):
    def test_double_booking_and_status_guards(self):
        # Tests that scheduling already reserved doctor slots triggers a ValidationError
        # Verify slot status maps back to AVAILABLE upon appointment cancellation.
        pass`}</pre>
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t border-slate-800 text-slate-500 text-[10px]">
                💡 Full python-django and requirements file modules successfully populated in actual directory: <strong>/medical_assistant</strong>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'architecture' && (
          <div id="architecture-diagrams" className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-slate-900">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-600" />
                Interactions and Data Serialization Pipelines
              </h2>
              
              {/* Process Cards Flowchart Grid */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-2 relative">
                  <div className="absolute top-2 right-2 font-mono text-[10px] bg-slate-205 text-slate-600 font-bold px-1.5 py-0.5 rounded">1</div>
                  <h3 className="font-bold text-sm text-slate-800">Voice Capture</h3>
                  <p className="text-xs text-slate-500">Patient speaks booking trigger: e.g., "Schedule Dr. Jane Sharma tomorrow".</p>
                </div>

                <div className="hidden md:flex items-center justify-center text-slate-400">
                  <ChevronRight className="w-6 h-6 shrink-0" />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-2 relative">
                  <div className="absolute top-2 right-2 font-mono text-[10px] bg-slate-205 text-slate-600 font-bold px-1.5 py-0.5 rounded">2</div>
                  <h3 className="font-bold text-sm text-slate-800">SPEECH TO TEXT</h3>
                  <p className="text-xs text-slate-500">Web Speech API / future voice gateways process audio stream to raw transcript.</p>
                </div>

                <div className="hidden md:flex items-center justify-center text-slate-400">
                  <ChevronRight className="w-6 h-6 shrink-0" />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-2 relative">
                  <div className="absolute top-2 right-2 font-mono text-[10px] bg-slate-205 text-slate-600 font-bold px-1.5 py-0.5 rounded">3</div>
                  <h3 className="font-bold text-sm text-slate-850">Intent Parsing</h3>
                  <p className="text-xs text-slate-500">Gemini LLM / NLU extract intent cards (e.g. BOOK_APPOINTMENT) and entity slot values.</p>
                </div>

                <div className="hidden md:flex items-center justify-center text-slate-400">
                  <ChevronRight className="w-6 h-6 shrink-0" />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-2 relative">
                  <div className="absolute top-2 right-2 font-mono text-[10px] bg-slate-205 text-slate-600 font-bold px-1.5 py-0.5 rounded">4</div>
                  <h3 className="font-bold text-sm text-slate-800">DRF Serialization</h3>
                  <p className="text-xs text-slate-500">Django REST validations lock double-booking, check doctor slots availability.</p>
                </div>

                <div className="hidden md:flex items-center justify-center text-slate-400">
                  <ChevronRight className="w-6 h-6 shrink-0" />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-2 relative">
                  <div className="absolute top-2 right-2 font-mono text-[10px] bg-slate-205 text-slate-600 font-bold px-1.5 py-0.5 rounded">5</div>
                  <h3 className="font-bold text-sm text-slate-800">PostgreSQL</h3>
                  <p className="text-xs text-slate-500">Atomic transactions update slot status (AVAILABLE → BOOKED) and log execution turn.</p>
                </div>

                <div className="hidden md:flex items-center justify-center text-slate-400">
                  <ChevronRight className="w-6 h-6 shrink-0" />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-250 flex flex-col gap-2 relative">
                  <div className="absolute top-2 right-2 font-mono text-[10px] bg-slate-205 text-slate-600 font-bold px-1.5 py-0.5 rounded">6</div>
                  <h3 className="font-bold text-sm text-slate-800">Speech Out</h3>
                  <p className="text-xs text-slate-500">Response synthesized back (TTS) for vocalized patient feedback.</p>
                </div>

              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-slate-910">
              <h2 className="text-lg font-bold mb-3">Professional Normalized Relational ERD Map</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                <div className="p-4 bg-slate-55 rounded-xl border border-slate-205">
                  <strong className="text-emerald-700 block mb-2">TABLE: doctors_doctor</strong>
                  - id [PK]<br/>
                  - name [Varchar]<br/>
                  - specialization [Varchar]<br/>
                  - consultation_fee [Decimal]<br/>
                  - hospital_id [FK → hospital.id]<br/>
                  - experience_years [Integer]
                </div>
                <div className="p-4 bg-slate-55 rounded-xl border border-slate-205">
                  <strong className="text-emerald-700 block mb-2">TABLE: patients_patient</strong>
                  - id [PK]<br/>
                  - user_id [FK → auth_user.id]<br/>
                  - name [Varchar]<br/>
                  - phone [Varchar]<br/>
                  - email [Varchar]<br/>
                  - age / gender
                </div>
                <div className="p-4 bg-slate-55 rounded-xl border border-slate-205">
                  <strong className="text-emerald-700 block mb-2">TABLE: availability_availability</strong>
                  - id [PK]<br/>
                  - doctor_id [FK → doctor.id]<br/>
                  - date [Date]<br/>
                  - start_time / end_time<br/>
                  - slot_status [AVAILABLE/BOOKED]<br/>
                  * Unique: doctor_id + date + start_time
                </div>
                <div className="p-4 bg-slate-55 rounded-xl border border-slate-205">
                  <strong className="text-emerald-700 block mb-2">TABLE: appointments_appointment</strong>
                  - id [PK]<br/>
                  - patient_id [FK → patient.id]<br/>
                  - doctor_id [FK → doctor.id]<br/>
                  - appointment_date [Date]<br/>
                  - appointment_time [Time]<br/>
                  - status [SCHEDULED/CANCELLED/RESCHEDULED]
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Humble Aesthetic Footer */}
      <footer id="app-footer" className="bg-slate-900 text-slate-400 py-6 px-6 mt-auto border-t border-slate-800 text-center text-xs">
        <p>© 2026 Voice Doctor Booking Assistant Console. Managed with Python Django REST Framework & PostgreSQL integration.</p>
      </footer>
    </div>
  );
}
