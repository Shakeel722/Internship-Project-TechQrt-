import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client
const aiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (aiApiKey && aiApiKey !== 'MY_GEMINI_API_KEY') {
  ai = new GoogleGenAI({
    apiKey: aiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ==========================================
// IN-MEMORY MOCK POSTGRESQL DATABASE SIMULATION
// ==========================================

const db = {
  hospitals: [
    { id: 1, name: 'General Health Clinic', address: '123 Care Lane, Medical District', phone: '+1-555-999-8888' },
    { id: 2, name: 'Metro Heart Institute', address: '456 Cardiovascular Blvd', phone: '+1-555-222-3333' },
    { id: 3, name: 'St. Jude Pediatrics', address: '789 Toddler Ave, Green Hills', phone: '+1-555-444-5555' }
  ],
  doctors: [
    { id: 101, name: 'Dr. Jane Sharma', specialization: 'Dermatologist', experience_years: 10, consultation_fee: 150.00, hospital_id: 1, phone: '+1-555-101-9999', email: 'janesharma@clinic.com' },
    { id: 102, name: 'Dr. Amit Patel', specialization: 'Cardiologist', experience_years: 15, consultation_fee: 250.00, hospital_id: 2, phone: '+1-555-102-8888', email: 'amitpatel@metroheart.com' },
    { id: 103, name: 'Dr. Sarah Smith', specialization: 'Pediatrician', experience_years: 8, consultation_fee: 120.00, hospital_id: 3, phone: '+1-555-103-7777', email: 'sarahsmith@stjude.com' },
    { id: 104, name: 'Dr. John Miller', specialization: 'General Physician', experience_years: 12, consultation_fee: 100.00, hospital_id: 1, phone: '+1-555-104-6666', email: 'johnmiller@clinic.com' }
  ],
  patients: [
    { id: 201, name: 'Alice Smith', phone: '+1-555-111-2233', email: 'patient@test.com', age: 28, gender: 'Female' }
  ],
  availabilities: [
    // Today & Tomorrow Slots (Dynamic date calc)
    { id: 1, doctor_id: 101, date: getOffsetDateString(0), start_time: '11:00:00', end_time: '12:00:00', slot_status: 'AVAILABLE' },
    { id: 2, doctor_id: 101, date: getOffsetDateString(1), start_time: '14:00:00', end_time: '15:00:00', slot_status: 'AVAILABLE' },
    { id: 3, doctor_id: 102, date: getOffsetDateString(1), start_time: '10:00:00', end_time: '11:00:00', slot_status: 'AVAILABLE' },
    { id: 4, doctor_id: 102, date: getOffsetDateString(2), start_time: '15:30:00', end_time: '16:30:00', slot_status: 'AVAILABLE' },
    { id: 5, doctor_id: 103, date: getOffsetDateString(1), start_time: '11:00:00', end_time: '12:00:00', slot_status: 'AVAILABLE' },
    { id: 6, doctor_id: 103, date: getOffsetDateString(1), start_time: '13:00:00', end_time: '14:00:00', slot_status: 'AVAILABLE' },
    { id: 7, doctor_id: 104, date: getOffsetDateString(0), start_time: '09:30:00', end_time: '10:30:00', slot_status: 'AVAILABLE' }
  ],
  appointments: [] as any[],
  conversationLogs: [] as any[]
};

function getOffsetDateString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

// Keep trace of active voice conversational sessions
const voiceSessionsActive = new Map<string, any>();

// ==========================================
// ENHANCED REST ENDPOINTS (Django REST Mirror)
// ==========================================

// Log Request payload utility helper to trace operations
function logApiCall(method: string, url: string, payload: any, responseStatus: number, responseBody: any) {
  const log = {
    id: db.conversationLogs.length + 1,
    timestamp: new Date().toISOString(),
    method,
    url,
    payload,
    status: responseStatus,
    response: responseBody
  };
  db.conversationLogs.unshift(log);
  if (db.conversationLogs.length > 50) db.conversationLogs.pop();
}

// Auth Login
app.post('/api/accounts/login/', (req, res) => {
  const response = {
    access: 'simulated-jwt-access-token-string-7f#0v',
    refresh: 'simulated-jwt-refresh-token-string-9m!2x',
    user: { email: 'patient@test.com', phone: '+1-555-111-2233', role: 'PATIENT' }
  };
  logApiCall('POST', '/api/accounts/login/', req.body, 200, response);
  res.json(response);
});

// Profile Retrieval
app.get('/api/accounts/profile/', (req, res) => {
  res.json({ email: 'patient@test.com', phone: '+1-555-111-2233', role: 'PATIENT' });
});

// Hospitals
app.get('/api/hospitals/', (req, res) => {
  res.json(db.hospitals);
});

// Doctors
app.get('/api/doctors/', (req, res) => {
  const query = req.query.search as string;
  if (query) {
    const term = query.toLowerCase();
    const filtered = db.doctors.filter(d => 
      d.name.toLowerCase().includes(term) || 
      d.specialization.toLowerCase().includes(term)
    );
    return res.json(filtered);
  }
  res.json(db.doctors);
});

// Availability
app.get('/api/availability/', (req, res) => {
  const { doctor_id, date, slot_status } = req.query;
  let list = db.availabilities;
  if (doctor_id) list = list.filter(a => a.doctor_id === parseInt(doctor_id as string));
  if (date) list = list.filter(a => a.date === date);
  if (slot_status) list = list.filter(a => a.slot_status === slot_status);
  
  // Enrich doctor name
  const enriched = list.map(a => {
    const doc = db.doctors.find(d => d.id === a.doctor_id);
    return { ...a, doctor_name: doc?.name, specialization: doc?.specialization };
  });
  res.json(enriched);
});

// Create appointment (Direct Booking)
app.post('/api/appointments/', (req, res) => {
  const { patient, doctor, appointment_date, appointment_time } = req.body;
  if (!doctor || !appointment_date || !appointment_time) {
    return res.status(400).json({ detail: 'Missing required parameters: doctor, appointment_date, appointment_time' });
  }

  // Find slot
  const slot = db.availabilities.find(a => 
    a.doctor_id === parseInt(doctor) && 
    a.date === appointment_date && 
    a.start_time === appointment_time
  );

  if (!slot) {
    return res.status(400).json({ detail: 'No availability slot found for doctor at chosen time.' });
  }
  if (slot.slot_status !== 'AVAILABLE') {
    return res.status(400).json({ detail: 'Requested slot is not available.' });
  }

  // Prevent Doctor Double booking
  const conflict = db.appointments.find(a => 
    a.doctor_id === parseInt(doctor) && 
    a.appointment_date === appointment_date && 
    a.appointment_time === appointment_time && 
    a.status === 'SCHEDULED'
  );
  if (conflict) {
    return res.status(400).json({ detail: 'This doctor already has a confirmed booking at this exact time.' });
  }

  // Book atomically
  slot.slot_status = 'BOOKED';
  const newAppt = {
    id: db.appointments.length + 10001,
    patient_id: 201,
    doctor_id: parseInt(doctor),
    appointment_date,
    appointment_time,
    status: 'SCHEDULED',
    created_at: new Date().toISOString()
  };
  db.appointments.push(newAppt);
  
  logApiCall('POST', '/api/appointments/', req.body, 201, newAppt);
  res.status(201).json(newAppt);
});

// Cancel appointment
app.post('/api/appointments/:id/cancel/', (req, res) => {
  const apptId = parseInt(req.params.id);
  const appt = db.appointments.find(a => a.id === apptId);
  if (!appt) {
    return res.status(404).json({ detail: 'Appointment not found.' });
  }
  if (appt.status === 'CANCELLED') {
    return res.status(400).json({ detail: 'Appointment already cancelled.' });
  }

  appt.status = 'CANCELLED';
  // Free availability slot
  const slot = db.availabilities.find(s => 
    s.doctor_id === appt.doctor_id && 
    s.date === appt.appointment_date && 
    s.start_time === appt.appointment_time
  );
  if (slot) slot.slot_status = 'AVAILABLE';

  logApiCall('POST', `/api/appointments/${apptId}/cancel/`, {}, 200, { detail: 'Cancelled', status: 'CANCELLED' });
  res.json({ detail: 'Appointment cancelled successfully.', status: 'CANCELLED' });
});

// Reschedule appointment
app.post('/api/appointments/:id/reschedule/', (req, res) => {
  const apptId = parseInt(req.params.id);
  const { appointment_date, appointment_time } = req.body;
  const appt = db.appointments.find(a => a.id === apptId);
  if (!appt) {
    return res.status(404).json({ detail: 'Appointment not found.' });
  }

  // Verify new slot is available
  const newSlot = db.availabilities.find(s => 
    s.doctor_id === appt.doctor_id && 
    s.date === appointment_date && 
    s.start_time === appointment_time
  );

  if (!newSlot || newSlot.slot_status !== 'AVAILABLE') {
    return res.status(400).json({ detail: 'The requested slot is not available or does not exist.' });
  }

  // Revert old slot
  const oldSlot = db.availabilities.find(s => 
    s.doctor_id === appt.doctor_id && 
    s.date === appt.appointment_date && 
    s.start_time === appt.appointment_time
  );
  if (oldSlot) oldSlot.slot_status = 'AVAILABLE';

  // Reserve new
  newSlot.slot_status = 'BOOKED';
  appt.appointment_date = appointment_date;
  appt.appointment_time = appointment_time;
  appt.status = 'RESCHEDULED';

  logApiCall('POST', `/api/appointments/${apptId}/reschedule/`, req.body, 200, appt);
  res.json(appt);
});

// Fetch appointments list
app.get('/api/appointments/', (req, res) => {
  const list = db.appointments.map(a => {
    const doc = db.doctors.find(d => d.id === a.doctor_id);
    const hos = doc ? db.hospitals.find(h => h.id === doc.hospital_id) : null;
    return {
      ...a,
      doctor_details: doc ? {
        id: doc.id,
        name: doc.name,
        specialization: doc.specialization,
        hospital_details: hos
      } : null,
      patient_details: db.patients[0]
    };
  });
  res.json(list);
});

// Get Database Log trace values
app.get('/api/sim-logs/', (req, res) => {
  res.json({
    logs: db.conversationLogs,
    db: {
      doctors: db.doctors,
      appointments: db.appointments,
      availabilities: db.availabilities
    }
  });
});

// ==========================================
// CONVERSATIONAL AI CORE ROUTING (Gemini Integration)
// ==========================================

app.post('/api/ai-agent/chat/', async (req, res) => {
  const { session_id, message } = req.body;
  if (!message) {
    return res.status(400).json({ detail: 'message field is required' });
  }

  const sId = session_id || 'default-sess';
  
  // Collect history and session variables
  let sess = voiceSessionsActive.get(sId);
  if (!sess) {
    sess = {
      history: [] as { role: string, text: string }[],
      slots: {
        specialization: null,
        doctor_name: null,
        date: null,
        time: null,
        selected_doctor_id: null,
        booking_step: null
      }
    };
    voiceSessionsActive.set(sId, sess);
  }

  sess.history.push({ role: 'user', text: message });

  // Prep active database state for Gemini prompt so it ground its slot recommendations on REAL slot availability
  const availableSlotsList = db.availabilities
    .filter(a => a.slot_status === 'AVAILABLE')
    .map(a => {
      const doc = db.doctors.find(d => d.id === a.doctor_id);
      return {
        doctor_id: a.doctor_id,
        doctor_name: doc?.name,
        specialization: doc?.specialization,
        date: a.date,
        time: a.start_time
      };
    });

  let botResponseText = "";
  let intentDetected = "GENERAL_GREETING";
  let extractedSlots = sess.slots;

  if (ai) {
    try {
      // Prompt Gemini using structured json matching instructions
      const systemPrompt = `
You are the Voice Booking Agent for a Doctor Appointment system. Your task is to process natural voice queries, carry out a friendly conversation, and extract scheduling intents and entities structure.

Here is the current Doctor Database of available vacancy slots on our PostgreSQL backend:
${JSON.stringify(availableSlotsList)}

Extract:
1. "specialization" (Dermatologist, Cardiologist, Pediatrician, General Physician, Orthopedic etc)
2. "doctor_name" (Dr. Sharma, Dr. Patel, etc. strictly matching the doctors in DB)
3. "date" (Convert Tomorrow/Today to absolute ISO YYYY-MM-DD date. Current date is: ${getOffsetDateString(0)})
4. "time" (Convert time references like 2pm, 11am to HH:MM:SS)

Intent Classifications:
- FIND_DOCTOR: Patient looking for specialized doctor names
- CHECK_AVAILABILITY: Patient asking for available calendar hours
- BOOK_APPOINTMENT: Patient requesting to schedule or hold a slot
- CONFIRM_BOOKING: Patient confirming the booking with "yes", "go ahead" or general agreement
- CANCEL_FLOW: Patient canceling or saying "no"
- GENERAL_GREETING: Just greeting "hello", "hi", etc.

Provide your response strictly in JSON format as matched here:
{
  "response": "Brief natural response that sounds good when spoken out loud by a TTS model. For example: I found Dr. Sharma available tomorrow at 2:00 PM. Would you like me to book it?",
  "intent": "BOOK_APPOINTMENT",
  "entities": {
    "specialization": "Dermatologist" or null,
    "doctor_name": "Dr. Jane Sharma" or null,
    "date": "2026-06-11" or null,
    "time": "14:00:00" or null
  }
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          ...sess.history.map(h => `${h.role === 'user' ? 'Patient' : 'Agent'}: ${h.text}`),
          `Current turn: ${message}`
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              response: { type: Type.STRING },
              intent: { type: Type.STRING },
              entities: {
                type: Type.OBJECT,
                properties: {
                  specialization: { type: Type.STRING },
                  doctor_name: { type: Type.STRING },
                  date: { type: Type.STRING },
                  time: { type: Type.STRING }
                }
              }
            },
            required: ['response', 'intent', 'entities']
          }
        }
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      botResponseText = parsed.response || "";
      intentDetected = parsed.intent || "GENERAL_GREETING";
      
      // Merge slots
      if (parsed.entities) {
        Object.keys(parsed.entities).forEach(key => {
          if (parsed.entities[key]) extractedSlots[key] = parsed.entities[key];
        });
      }

    } catch (err: any) {
      console.error('Gemini processing error:', err);
      // Fallback to basic heuristics if API experiences transient errors
      const heuristic = fallbackHeuristicNLP(message, extractedSlots, availableSlotsList);
      botResponseText = heuristic.response;
      intentDetected = heuristic.intent;
    }
  } else {
    // Standard Heuristics (Pre-seed when API KEY is not supplied)
    const heuristic = fallbackHeuristicNLP(message, extractedSlots, availableSlotsList);
    botResponseText = heuristic.response;
    intentDetected = heuristic.intent;
  }

  // ==========================================
  // REAL-TIME ACTIONS SYNCHRONIZATION WITH DB
  // ==========================================
  if (intentDetected === 'CONFIRM_BOOKING' || message.toLowerCase() === 'yes') {
    // Book the active doctor/date/time
    let bookedSuccesfully = false;
    let appointmentDetails: any = null;

    // Find first matching active availability slot
    const targetDocName = extractedSlots.doctor_name;
    const targetDate = extractedSlots.date || getOffsetDateString(1);
    const targetTime = extractedSlots.time || '11:00:00';

    let matchingSlot = db.availabilities.find(a => a.slot_status === 'AVAILABLE' && a.date === targetDate);
    if (targetDocName) {
      const doc = db.doctors.find(d => d.name.toLowerCase().includes(targetDocName.toLowerCase()) || targetDocName.toLowerCase().includes(d.name.split(' ').pop()?.toLowerCase() || ''));
      if (doc) matchingSlot = db.availabilities.find(a => a.doctor_id === doc.id && a.date === targetDate && a.slot_status === 'AVAILABLE');
    }

    if (matchingSlot) {
      matchingSlot.slot_status = 'BOOKED';
      appointmentDetails = {
        id: db.appointments.length + 10001,
        patient_id: 201,
        doctor_id: matchingSlot.doctor_id,
        appointment_date: matchingSlot.date,
        appointment_time: matchingSlot.start_time,
        status: 'SCHEDULED',
        created_at: new Date().toISOString()
      };
      db.appointments.push(appointmentDetails);
      bookedSuccesfully = true;
      const finalDocName = db.doctors.find(d => d.id === matchingSlot?.doctor_id)?.name;
      botResponseText = `Perfect! I have confirmed your slot with ${finalDocName} on ${matchingSlot.date} at ${matchingSlot.start_time}. Your appointment reference ID is #${appointmentDetails.id}.`;
      intentDetected = 'CONFIRM_BOOKING';
    } else {
      botResponseText = `I'm sorry, I couldn't find a matching open slot. Please ask me to search for available doctor slots first.`;
    }
  }

  if (intentDetected === 'CANCEL_FLOW') {
    // Reset session variables
    sess.slots = { specialization: null, doctor_name: null, date: null, time: null, selected_doctor_id: null, booking_step: null };
  }

  sess.history.push({ role: 'model', text: botResponseText });
  if (sess.history.length > 20) sess.history.shift();

  // Log in Postgres console array
  const logResponse = {
    session_id: sId,
    intent: intentDetected,
    extracted_entities: extractedSlots,
    response: botResponseText
  };
  logApiCall('POST', '/api/ai-agent/chat/', { session_id: sId, message }, 200, logResponse);

  res.json(logResponse);
});

// Heuristic pattern extractor when Gemini is not connected
function fallbackHeuristicNLP(msg: string, contextSlots: any, activeSlots: any[]) {
  const msg_lower = msg.toLowerCase();
  let response = "I can search for doctors, display availability, and book appointments. Try saying 'I need a skin doctor tomorrow'";
  let intent = "GENERAL_GREETING";

  if (msg_lower.includes('doctor') || msg_lower.includes('show') || msg_lower.includes('find') || msg_lower.includes('search')) {
    intent = "FIND_DOCTOR";
    let spec = "Dermatologist";
    if (msg_lower.includes('heart') || msg_lower.includes('cardio')) spec = "Cardiologist";
    if (msg_lower.includes('child') || msg_lower.includes('pediatri')) spec = "Pediatrician";
    
    // Find matching doctor names
    const matchedDocs = db.doctors.filter(d => d.specialization.toLowerCase().includes(spec.toLowerCase()));
    contextSlots.specialization = spec;
    response = `I found ${matchedDocs.length} ${spec}s: ${matchedDocs.map(d => d.name).join(', ')}. Which one would you prefer?`;
  }
  else if (msg_lower.includes('available') || msg_lower.includes('slots') || msg_lower.includes('when')) {
    intent = "CHECK_AVAILABILITY";
    const tomorrowStr = getOffsetDateString(1);
    contextSlots.date = tomorrowStr;
    const slots = activeSlots.filter(a => a.date === tomorrowStr);
    if (slots.length > 0) {
      response = `We have active openings tomorrow: ${slots.map(s => `${s.doctor_name} at ${s.time}`).join(' and ')}. Would you like me to book it?`;
    } else {
      response = "We don't have any open slots left today or tomorrow, please specify another day.";
    }
  }
  else if (msg_lower.includes('cancel') || msg_lower.includes('delete')) {
    intent = "CANCEL_APPOINTMENT";
    response = "To cancel your appointment, please choose any appointment from your list and click 'Cancel Appointment' or say 'cancel booking name'";
  }
  else if (msg_lower.includes('tomorrow') || msg_lower.includes('book') || msg_lower.includes('schedule')) {
    intent = "BOOK_APPOINTMENT";
    let spec = contextSlots.specialization || "Dermatologist";
    if (msg_lower.includes('heart')) spec = "Cardiologist";
    contextSlots.specialization = spec;
    contextSlots.date = getOffsetDateString(1);
    
    const doc = db.doctors.find(d => d.specialization === spec);
    if (doc) {
      contextSlots.doctor_name = doc.name;
      response = `I found Dr. ${doc.name.split(' ').pop()} (${spec}) available tomorrow. Dr. is available at 11:00 AM. Out of these slots, would you like to confirm the booking?`;
    } else {
      response = "Certainly! Which specialization or doctor name would you like to book?";
    }
  }

  return { intent, response };
}

// ==========================================
// STATIC FILES & VITE MIDDLEWARE INTERSECTION
// ==========================================

// In development, handle Vite dev server programmatic hosting on port 3000
const isProd = process.env.NODE_ENV === 'production';

if (!isProd) {
  import('vite').then((vite) => {
    vite.createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    }).then((viteServer) => {
      app.use(viteServer.middlewares);
      app.use((req: Request, res: Response, next: NextFunction) => {
        next();
      });
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Development Server Active on: http://localhost:${PORT}`);
      });
    });
  }).catch((err) => {
    console.error('Failed to boot Vite dev middleware:', err);
  });
} else {
  // Production server serving prebuilt files
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Production Server Active on: http://localhost:${PORT}`);
  });
}
